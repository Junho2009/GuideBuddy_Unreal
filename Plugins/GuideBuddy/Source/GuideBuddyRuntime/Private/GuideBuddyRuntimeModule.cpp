#include "GuideBuddyTelemetryBridge.h"

#include "Components/TempestAttributesComponents.h"
#include "Components/TempestBaseAbilityManagerComponent.h"
#include "Components/TempestBaseInputComponent.h"
#include "Components/TempestBaseStateManagerComponent.h"
#include "Components/TempestCombatComponent.h"
#include "Containers/Ticker.h"
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"
#include "GameFramework/PlayerController.h"
#include "GameplayTagContainer.h"
#include "InputAction.h"
#include "JsEnv.h"
#include "Modules/ModuleManager.h"
#include "Objects/TempestBaseAbilityObject.h"
#include "Objects/TempestBaseAttributeObject.h"
#include "Objects/TempestBaseStateObject.h"
#include "UObject/ObjectKey.h"
#include "UObject/StrongObjectPtr.h"

namespace GuideBuddyRuntime
{
static constexpr double DiscoveryIntervalSeconds = 0.5;

static bool IsRelevantWorld(const UWorld* World)
{
	if (!World)
	{
		return false;
	}

	const bool bRuntimeWorld = World->WorldType == EWorldType::Game || World->WorldType == EWorldType::PIE;
	if (!bRuntimeWorld)
	{
		return false;
	}

	return World->GetMapName().Contains(TEXT("SampleDemoShowcaseMap"));
}

static FString TagToString(const FGameplayTag& Tag)
{
	return Tag.IsValid() ? Tag.ToString() : TEXT("");
}

static TSharedPtr<FJsonObject> BuildGameplayTagObject(const FGameplayTag& Tag)
{
	TSharedPtr<FJsonObject> TagObject = MakeShared<FJsonObject>();
	TagObject->SetBoolField(TEXT("is_valid"), Tag.IsValid());
	TagObject->SetStringField(TEXT("tag"), TagToString(Tag));
	return TagObject;
}
}

class FGuideBuddyRuntimeModule final : public IModuleInterface
{
public:
	virtual void StartupModule() override
	{
		OnPostWorldInitializationHandle = FWorldDelegates::OnPostWorldInitialization.AddRaw(
			this,
			&FGuideBuddyRuntimeModule::HandlePostWorldInitialization);

		OnWorldCleanupHandle = FWorldDelegates::OnWorldCleanup.AddRaw(
			this,
			&FGuideBuddyRuntimeModule::HandleWorldCleanup);

		TickHandle = FTSTicker::GetCoreTicker().AddTicker(
			FTickerDelegate::CreateRaw(this, &FGuideBuddyRuntimeModule::Tick));
	}

	virtual void ShutdownModule() override
	{
		EndSession(TEXT("module_shutdown"));

		if (TickHandle.IsValid())
		{
			FTSTicker::GetCoreTicker().RemoveTicker(TickHandle);
			TickHandle.Reset();
		}

		if (OnPostWorldInitializationHandle.IsValid())
		{
			FWorldDelegates::OnPostWorldInitialization.Remove(OnPostWorldInitializationHandle);
			OnPostWorldInitializationHandle.Reset();
		}

		if (OnWorldCleanupHandle.IsValid())
		{
			FWorldDelegates::OnWorldCleanup.Remove(OnWorldCleanupHandle);
			OnWorldCleanupHandle.Reset();
		}
	}

private:
	void HandlePostWorldInitialization(UWorld* World, const UWorld::InitializationValues)
	{
		if (GuideBuddyRuntime::IsRelevantWorld(World))
		{
			StartSession(World);
		}
	}

	void HandleWorldCleanup(UWorld* World, bool, bool)
	{
		if (ActiveWorld.Get() == World)
		{
			EndSession(TEXT("world_cleanup"));
		}
	}

	bool Tick(float)
	{
		if (!ActiveWorld.IsValid())
		{
			TryStartFromExistingWorld();
			return true;
		}

		if (!Bridge.IsValid())
		{
			EndSession(TEXT("bridge_invalid"));
			return true;
		}

		DiscoverAndPoll(false);
		return true;
	}

	void TryStartFromExistingWorld()
	{
		if (!GEngine)
		{
			return;
		}

		for (const FWorldContext& WorldContext : GEngine->GetWorldContexts())
		{
			UWorld* World = WorldContext.World();
			if (GuideBuddyRuntime::IsRelevantWorld(World))
			{
				StartSession(World);
				return;
			}
		}
	}

	void StartSession(UWorld* World)
	{
		if (!World)
		{
			return;
		}

		if (ActiveWorld.Get() == World && Bridge.IsValid())
		{
			return;
		}

		EndSession(TEXT("replaced"));

		ActiveWorld = World;
		Bridge = TStrongObjectPtr<UGuideBuddyTelemetryBridge>(NewObject<UGuideBuddyTelemetryBridge>(GetTransientPackage()));
		Bridge->Initialize(World);

		JsEnv = MakeShared<PUERTS_NAMESPACE::FJsEnv>(TEXT("JavaScript"));
		TArray<TPair<FString, UObject*>> Arguments;
		Arguments.Emplace(TEXT("GuideBuddyBridge"), Bridge.Get());
		Arguments.Emplace(TEXT("World"), World);
		JsEnv->Start(TEXT("GuideBuddy/main"), Arguments);

		Bridge->EmitBridgeStarted();
		LastDiscoveryPlatformSeconds = 0.0;
		DiscoverAndPoll(true);
	}

	void EndSession(const FString& Reason)
	{
		if (Bridge.IsValid())
		{
			Bridge->EmitBridgeShutdown(Reason);
		}

		JsEnv.Reset();
		Bridge.Reset();
		ActiveWorld.Reset();
		BoundInputComponents.Reset();
		LastActiveAbilities.Reset();
		LastActiveStates.Reset();
		LastCombatStatuses.Reset();
		LastAttributeValues.Reset();
		LastDiscoveryPlatformSeconds = 0.0;
	}

	void DiscoverAndPoll(bool bForceDiscovery)
	{
		UWorld* World = ActiveWorld.Get();
		if (!World || !Bridge.IsValid())
		{
			return;
		}

		const double NowSeconds = FPlatformTime::Seconds();
		const bool bShouldDiscover = bForceDiscovery || NowSeconds - LastDiscoveryPlatformSeconds >= GuideBuddyRuntime::DiscoveryIntervalSeconds;
		if (bShouldDiscover)
		{
			BindInputDelegates(World);
			LastDiscoveryPlatformSeconds = NowSeconds;
		}

		PollActorState(World);
	}

	void BindInputDelegates(UWorld* World)
	{
		for (TActorIterator<AActor> ActorIt(World); ActorIt; ++ActorIt)
		{
			AActor* Actor = *ActorIt;
			if (!IsValid(Actor))
			{
				continue;
			}

			UTempestBaseInputComponent* InputComponent = Actor->FindComponentByClass<UTempestBaseInputComponent>();
			if (!InputComponent)
			{
				continue;
			}

			const FObjectKey InputKey(InputComponent);
			if (BoundInputComponents.Contains(InputKey))
			{
				continue;
			}

			InputComponent->OnBufferedInputFired.AddUniqueDynamic(Bridge.Get(), &UGuideBuddyTelemetryBridge::HandleBufferedInput);
			InputComponent->OnWatchListCurrentTriggeredInputChanged.AddUniqueDynamic(
				Bridge.Get(),
				&UGuideBuddyTelemetryBridge::HandleWatchListInputChanged);
			InputComponent->OnInputTriggerEventChange.AddUniqueDynamic(
				Bridge.Get(),
				&UGuideBuddyTelemetryBridge::HandleInputTriggerEvent);
			BoundInputComponents.Add(InputKey);
		}
	}

	void PollActorState(UWorld* World)
	{
		for (TActorIterator<AActor> ActorIt(World); ActorIt; ++ActorIt)
		{
			AActor* Actor = *ActorIt;
			if (!IsValid(Actor))
			{
				continue;
			}

			PollAbility(Actor);
			PollState(Actor);
			PollCombatStatus(Actor);
			PollAttributes(Actor);
		}
	}

	void PollAbility(AActor* Actor)
	{
		UTempestBaseAbilityManagerComponent* AbilityComponent = Actor->FindComponentByClass<UTempestBaseAbilityManagerComponent>();
		if (!AbilityComponent)
		{
			return;
		}

		const FObjectKey ComponentKey(AbilityComponent);
		UTempestBaseAbilityObject* CurrentAbility = AbilityComponent->GetCurrentActiveAbility();
		TWeakObjectPtr<UTempestBaseAbilityObject>* PreviousAbilityPtr = LastActiveAbilities.Find(ComponentKey);

		if (!PreviousAbilityPtr)
		{
			LastActiveAbilities.Add(ComponentKey, CurrentAbility);
			if (CurrentAbility)
			{
				EmitAbilityChanged(Actor, CurrentAbility, TEXT("initial"));
			}
			return;
		}

		if (PreviousAbilityPtr->Get() != CurrentAbility)
		{
			LastActiveAbilities.Add(ComponentKey, CurrentAbility);
			if (CurrentAbility)
			{
				EmitAbilityChanged(Actor, CurrentAbility, TEXT("activated"));
			}
		}
	}

	void EmitAbilityChanged(AActor* Actor, UTempestBaseAbilityObject* Ability, const FString& ChangeType)
	{
		TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
		Payload->SetStringField(TEXT("change_type"), ChangeType);
		Payload->SetObjectField(TEXT("actor"), Bridge->BuildActorObject(Actor));
		Payload->SetObjectField(TEXT("ability"), Bridge->BuildObjectObject(Ability));
		Payload->SetStringField(TEXT("ability_tag"), Ability ? GuideBuddyRuntime::TagToString(Ability->AbilityGameplayTag) : TEXT(""));
		Payload->SetObjectField(TEXT("ability_gameplay_tag"), Ability ? GuideBuddyRuntime::BuildGameplayTagObject(Ability->AbilityGameplayTag) : MakeShared<FJsonObject>());
		Bridge->EmitSignal(TEXT("ability_activated"), Payload);
	}

	void PollState(AActor* Actor)
	{
		UTempestBaseStateManagerComponent* StateComponent = Actor->FindComponentByClass<UTempestBaseStateManagerComponent>();
		if (!StateComponent)
		{
			return;
		}

		const FObjectKey ComponentKey(StateComponent);
		UTempestBaseStateObject* CurrentState = StateComponent->GetCurrentActiveState();
		TWeakObjectPtr<UTempestBaseStateObject>* PreviousStatePtr = LastActiveStates.Find(ComponentKey);

		if (!PreviousStatePtr)
		{
			LastActiveStates.Add(ComponentKey, CurrentState);
			if (CurrentState)
			{
				EmitStateChanged(Actor, CurrentState, TEXT("initial"));
			}
			return;
		}

		if (PreviousStatePtr->Get() != CurrentState)
		{
			LastActiveStates.Add(ComponentKey, CurrentState);
			if (CurrentState)
			{
				EmitStateChanged(Actor, CurrentState, TEXT("activated"));
			}
		}
	}

	void EmitStateChanged(AActor* Actor, UTempestBaseStateObject* State, const FString& ChangeType)
	{
		TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
		Payload->SetStringField(TEXT("change_type"), ChangeType);
		Payload->SetObjectField(TEXT("actor"), Bridge->BuildActorObject(Actor));
		Payload->SetObjectField(TEXT("state"), Bridge->BuildObjectObject(State));
		Payload->SetStringField(TEXT("state_tag"), State ? GuideBuddyRuntime::TagToString(State->StateGameplayTag) : TEXT(""));
		Payload->SetObjectField(TEXT("state_gameplay_tag"), State ? GuideBuddyRuntime::BuildGameplayTagObject(State->StateGameplayTag) : MakeShared<FJsonObject>());
		Bridge->EmitSignal(TEXT("state_activated"), Payload);
	}

	void PollCombatStatus(AActor* Actor)
	{
		UTempestCombatComponent* CombatComponent = Actor->FindComponentByClass<UTempestCombatComponent>();
		if (!CombatComponent)
		{
			return;
		}

		const FObjectKey ComponentKey(CombatComponent);
		const FGameplayTagContainer CurrentStatus = CombatComponent->GetCombatStatus();
		FGameplayTagContainer* PreviousStatus = LastCombatStatuses.Find(ComponentKey);

		if (!PreviousStatus)
		{
			LastCombatStatuses.Add(ComponentKey, CurrentStatus);
			return;
		}

		for (const FGameplayTag& Tag : CurrentStatus)
		{
			if (!PreviousStatus->HasTagExact(Tag))
			{
				EmitCombatStatusChanged(Actor, Tag, TEXT("add"));
			}
		}

		for (const FGameplayTag& Tag : *PreviousStatus)
		{
			if (!CurrentStatus.HasTagExact(Tag))
			{
				EmitCombatStatusChanged(Actor, Tag, TEXT("remove"));
			}
		}

		LastCombatStatuses.Add(ComponentKey, CurrentStatus);
	}

	void EmitCombatStatusChanged(AActor* Actor, const FGameplayTag& Tag, const FString& ChangeType)
	{
		TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
		Payload->SetStringField(TEXT("change_type"), ChangeType);
		Payload->SetObjectField(TEXT("actor"), Bridge->BuildActorObject(Actor));
		Payload->SetStringField(TEXT("combat_status_tag"), GuideBuddyRuntime::TagToString(Tag));
		Payload->SetObjectField(TEXT("combat_status_gameplay_tag"), GuideBuddyRuntime::BuildGameplayTagObject(Tag));
		Bridge->EmitSignal(TEXT("combat_status_changed"), Payload);
	}

	void PollAttributes(AActor* Actor)
	{
		UTempestAttributesComponents* AttributesComponent = Actor->FindComponentByClass<UTempestAttributesComponents>();
		if (!AttributesComponent)
		{
			return;
		}

		for (UTempestBaseAttributeObject* Attribute : AttributesComponent->CreatedAttributes)
		{
			if (!Attribute)
			{
				continue;
			}

			const FObjectKey AttributeKey(Attribute);
			const float CurrentValue = Attribute->AttributeValues.AttributeValue;
			const float* PreviousValue = LastAttributeValues.Find(AttributeKey);

			if (!PreviousValue)
			{
				LastAttributeValues.Add(AttributeKey, CurrentValue);
				continue;
			}

			if (!FMath::IsNearlyEqual(*PreviousValue, CurrentValue, 0.001f))
			{
				EmitAttributeChanged(Actor, Attribute, *PreviousValue, CurrentValue);
				LastAttributeValues.Add(AttributeKey, CurrentValue);
			}
		}
	}

	void EmitAttributeChanged(AActor* Actor, UTempestBaseAttributeObject* Attribute, float PreviousValue, float CurrentValue)
	{
		TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
		Payload->SetObjectField(TEXT("actor"), Bridge->BuildActorObject(Actor));
		Payload->SetObjectField(TEXT("attribute"), Bridge->BuildObjectObject(Attribute));
		Payload->SetStringField(TEXT("attribute_tag"), Attribute ? GuideBuddyRuntime::TagToString(Attribute->AttributeGameplayTag) : TEXT(""));
		Payload->SetObjectField(TEXT("attribute_gameplay_tag"), Attribute ? GuideBuddyRuntime::BuildGameplayTagObject(Attribute->AttributeGameplayTag) : MakeShared<FJsonObject>());
		Payload->SetNumberField(TEXT("old_value"), PreviousValue);
		Payload->SetNumberField(TEXT("new_value"), CurrentValue);
		Payload->SetNumberField(TEXT("delta"), CurrentValue - PreviousValue);
		if (Attribute)
		{
			Payload->SetNumberField(TEXT("min_value"), Attribute->AttributeValues.MinAttributeValue);
			Payload->SetNumberField(TEXT("max_value"), Attribute->AttributeValues.MaxAttributeValue);
		}
		Bridge->EmitSignal(TEXT("attribute_changed"), Payload);
	}

private:
	FDelegateHandle OnPostWorldInitializationHandle;
	FDelegateHandle OnWorldCleanupHandle;
	FTSTicker::FDelegateHandle TickHandle;

	TWeakObjectPtr<UWorld> ActiveWorld;
	TStrongObjectPtr<UGuideBuddyTelemetryBridge> Bridge;
	TSharedPtr<PUERTS_NAMESPACE::FJsEnv> JsEnv;

	TSet<FObjectKey> BoundInputComponents;
	TMap<FObjectKey, TWeakObjectPtr<UTempestBaseAbilityObject>> LastActiveAbilities;
	TMap<FObjectKey, TWeakObjectPtr<UTempestBaseStateObject>> LastActiveStates;
	TMap<FObjectKey, FGameplayTagContainer> LastCombatStatuses;
	TMap<FObjectKey, float> LastAttributeValues;
	double LastDiscoveryPlatformSeconds = 0.0;
};

IMPLEMENT_MODULE(FGuideBuddyRuntimeModule, GuideBuddyRuntime)
