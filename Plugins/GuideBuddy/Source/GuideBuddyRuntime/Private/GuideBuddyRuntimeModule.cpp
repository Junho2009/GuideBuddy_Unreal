#include "GuideBuddyTelemetryBridge.h"

#include "GuideBuddyCombatControlBridge.h"
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
#include "InputCoreTypes.h"
#include "JsEnv.h"
#include "Misc/ConfigCacheIni.h"
#include "Modules/ModuleManager.h"
#include "Objects/TempestBaseAbilityObject.h"
#include "Objects/TempestBaseAttributeObject.h"
#include "Objects/TempestBaseStateObject.h"
#include "UObject/ObjectKey.h"
#include "UObject/StrongObjectPtr.h"

namespace GuideBuddyRuntime
{
static constexpr double DiscoveryIntervalSeconds = 0.5;
static constexpr double TrainingAttackWindowSeconds = 1.4;
static constexpr double TrainingPreDodgeGraceSeconds = 0.65;
static constexpr float TrainingSafeAttributeValue = 999999.0f;
static const TCHAR* MainMapName = TEXT("SampleDemoShowcaseMap");
static const TCHAR* DodgeTrainingMapName = TEXT("GuideBuddyDodgeTrainingArena");

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

	return World->GetMapName().Contains(MainMapName) || World->GetMapName().Contains(DodgeTrainingMapName);
}

static bool IsDodgeTrainingWorld(const UWorld* World)
{
	return World && World->GetMapName().Contains(DodgeTrainingMapName);
}

static bool IsMainShowcaseWorld(const UWorld* World)
{
	return World && World->GetMapName().Contains(MainMapName) && !IsDodgeTrainingWorld(World);
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

static FString BuildTrainingSignalText(const UObject* Object, const FString& GameplayTag)
{
	FString Signal = GameplayTag;
	if (!Object)
	{
		return Signal;
	}

	if (!Signal.IsEmpty())
	{
		Signal.AppendChar(TEXT(' '));
	}
	Signal += Object->GetName();

	const UClass* ObjectClass = Object->GetClass();
	if (ObjectClass)
	{
		Signal.AppendChar(TEXT(' '));
		Signal += ObjectClass->GetName();
	}

	return Signal;
}

static bool IsAttackLikeSignal(const FString& Signal)
{
	return Signal.Contains(TEXT("Attack"), ESearchCase::IgnoreCase) ||
		Signal.Contains(TEXT("CloseRange"), ESearchCase::IgnoreCase) ||
		Signal.Contains(TEXT("Slash"), ESearchCase::IgnoreCase) ||
		Signal.Contains(TEXT("GroundSmash"), ESearchCase::IgnoreCase);
}

static bool IsDodgeLikeSignal(const FString& Signal)
{
	return Signal.Contains(TEXT("Dodge"), ESearchCase::IgnoreCase) ||
		Signal.Contains(TEXT("Roll"), ESearchCase::IgnoreCase);
}

static bool IsTrainingProtectedAttributeTag(const FString& Tag)
{
	return Tag.Contains(TEXT("Health"), ESearchCase::IgnoreCase) ||
		Tag.Contains(TEXT("Posture"), ESearchCase::IgnoreCase);
}

static int32 ReadRequiredSuccessfulDodges()
{
	int32 RequiredDodges = 5;
	if (GConfig)
	{
		GConfig->GetInt(TEXT("GuideBuddyDodgeTraining"), TEXT("RequiredSuccessfulDodges"), RequiredDodges, GGameIni);
	}

	return FMath::Clamp(RequiredDodges, 1, 99);
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

	bool Tick(float DeltaTime)
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

		if (CombatControlBridge.IsValid())
		{
			CombatControlBridge->TickControl(DeltaTime);
		}

		DiscoverAndPoll(false);
		if (GuideBuddyRuntime::IsMainShowcaseWorld(ActiveWorld.Get()))
		{
			Bridge->ShowDodgeTrainingEntryButton();
			TickDodgeTrainingEntryPointerMode();
		}
		TickDodgeTraining(DeltaTime);
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
		CombatControlBridge = TStrongObjectPtr<UGuideBuddyCombatControlBridge>(NewObject<UGuideBuddyCombatControlBridge>(GetTransientPackage()));
		CombatControlBridge->Initialize(World);
		CombatControlBridge->SetSoulslikeControlsEnabled(true);
		UTempestBaseInputComponent::InputActionGate.BindUObject(
			CombatControlBridge.Get(),
			&UGuideBuddyCombatControlBridge::HandleInputActionGate);

		JsEnv = MakeShared<PUERTS_NAMESPACE::FJsEnv>(TEXT("JavaScript"));
		TArray<TPair<FString, UObject*>> Arguments;
		Arguments.Emplace(TEXT("GuideBuddyBridge"), Bridge.Get());
		Arguments.Emplace(TEXT("CombatControlBridge"), CombatControlBridge.Get());
		Arguments.Emplace(TEXT("World"), World);
		JsEnv->Start(TEXT("GuideBuddy/main"), Arguments);

		Bridge->EmitBridgeStarted();
		LastDiscoveryPlatformSeconds = 0.0;
		DiscoverAndPoll(true);

		if (GuideBuddyRuntime::IsDodgeTrainingWorld(World))
		{
			BeginDodgeTrainingSession();
		}
		else if (GuideBuddyRuntime::IsMainShowcaseWorld(World))
		{
			bDodgeTrainingMode = false;
			Bridge->ShowDodgeTrainingEntryButton();
		}
	}

	void EndSession(const FString& Reason)
	{
		if (Bridge.IsValid())
		{
			Bridge->RemoveDodgeTrainingWidgets();
			Bridge->EmitBridgeShutdown(Reason);
		}

		UTempestBaseInputComponent::InputActionGate.Unbind();
		if (CombatControlBridge.IsValid())
		{
			CombatControlBridge->Shutdown();
		}

		JsEnv.Reset();
		CombatControlBridge.Reset();
		Bridge.Reset();
		ActiveWorld.Reset();
		BoundInputComponents.Reset();
		LastActiveAbilities.Reset();
		LastActiveStates.Reset();
		LastCombatStatuses.Reset();
		LastAttributeValues.Reset();
		LastDiscoveryPlatformSeconds = 0.0;
		bDodgeTrainingMode = false;
		bDodgeTrainingCompleted = false;
		bTrainingAttackWindowActive = false;
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
		const FString AbilityTag = Ability ? GuideBuddyRuntime::TagToString(Ability->AbilityGameplayTag) : TEXT("");
		TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
		Payload->SetStringField(TEXT("change_type"), ChangeType);
		Payload->SetObjectField(TEXT("actor"), Bridge->BuildActorObject(Actor));
		Payload->SetObjectField(TEXT("ability"), Bridge->BuildObjectObject(Ability));
		Payload->SetStringField(TEXT("ability_tag"), AbilityTag);
		Payload->SetObjectField(TEXT("ability_gameplay_tag"), Ability ? GuideBuddyRuntime::BuildGameplayTagObject(Ability->AbilityGameplayTag) : MakeShared<FJsonObject>());
		Bridge->EmitSignal(TEXT("ability_activated"), Payload);
		HandleDodgeTrainingCombatSignal(Actor, GuideBuddyRuntime::BuildTrainingSignalText(Ability, AbilityTag));
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
		const FString StateTag = State ? GuideBuddyRuntime::TagToString(State->StateGameplayTag) : TEXT("");
		TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
		Payload->SetStringField(TEXT("change_type"), ChangeType);
		Payload->SetObjectField(TEXT("actor"), Bridge->BuildActorObject(Actor));
		Payload->SetObjectField(TEXT("state"), Bridge->BuildObjectObject(State));
		Payload->SetStringField(TEXT("state_tag"), StateTag);
		Payload->SetObjectField(TEXT("state_gameplay_tag"), State ? GuideBuddyRuntime::BuildGameplayTagObject(State->StateGameplayTag) : MakeShared<FJsonObject>());
		Bridge->EmitSignal(TEXT("state_activated"), Payload);
		HandleDodgeTrainingCombatSignal(Actor, GuideBuddyRuntime::BuildTrainingSignalText(State, StateTag));
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

	void BeginDodgeTrainingSession()
	{
		bDodgeTrainingMode = true;
		bDodgeTrainingCompleted = false;
		bTrainingAttackWindowActive = false;
		bTrainingDodgeSeenInWindow = false;
		bTrainingDamageTakenInWindow = false;
		RequiredSuccessfulDodges = GuideBuddyRuntime::ReadRequiredSuccessfulDodges();
		ConsecutiveSuccessfulDodges = 0;
		TrainingLastEnemyAttackTime = -1000.0;
		TrainingAttackWindowEndTime = -1000.0;
		TrainingLastPlayerDodgeTime = -1000.0;
		LastTrainingFeedback = TEXT("等待敌人攻击，看到起手后翻滚。");

		if (Bridge.IsValid())
		{
			Bridge->ShowDodgeTrainingHud(ConsecutiveSuccessfulDodges, RequiredSuccessfulDodges, LastTrainingFeedback);
		}
	}

	void TickDodgeTrainingEntryPointerMode()
	{
		if (!Bridge.IsValid())
		{
			return;
		}

		UWorld* World = ActiveWorld.Get();
		APlayerController* PlayerController = World ? World->GetFirstPlayerController() : nullptr;
		const bool bWantsPointer = PlayerController &&
			(PlayerController->IsInputKeyDown(EKeys::LeftAlt) || PlayerController->IsInputKeyDown(EKeys::RightAlt));
		Bridge->SetDodgeTrainingEntryPointerMode(bWantsPointer);
	}

	void TickDodgeTraining(float)
	{
		if (!bDodgeTrainingMode || bDodgeTrainingCompleted)
		{
			return;
		}

		UWorld* World = ActiveWorld.Get();
		if (!World)
		{
			return;
		}

		const double NowSeconds = World->GetTimeSeconds();
		if (bTrainingAttackWindowActive && NowSeconds >= TrainingAttackWindowEndTime)
		{
			const bool bSuccess = bTrainingDodgeSeenInWindow && !bTrainingDamageTakenInWindow;
			ResolveDodgeTrainingWindow(bSuccess, bSuccess
				? TEXT("躲避成功，保持节奏。")
				: TEXT("这次没有完成有效翻滚，连续次数重置。"));
		}

	}

	void HandleDodgeTrainingCombatSignal(AActor* Actor, const FString& Signal)
	{
		if (!bDodgeTrainingMode || bDodgeTrainingCompleted || !Bridge.IsValid() || Signal.IsEmpty())
		{
			return;
		}

		const FString Role = Bridge->GetActorRole(Actor);
		if (Role == TEXT("enemy") && GuideBuddyRuntime::IsAttackLikeSignal(Signal))
		{
			StartDodgeTrainingAttackWindow(Signal);
			return;
		}

		if (Role == TEXT("player") && GuideBuddyRuntime::IsDodgeLikeSignal(Signal))
		{
			RegisterDodgeTrainingDodge();
		}
	}

	void StartDodgeTrainingAttackWindow(const FString&)
	{
		UWorld* World = ActiveWorld.Get();
		if (!World)
		{
			return;
		}

		const double NowSeconds = World->GetTimeSeconds();
		if (NowSeconds - TrainingLastEnemyAttackTime < 0.55)
		{
			return;
		}

		if (bTrainingAttackWindowActive)
		{
			ResolveDodgeTrainingWindow(false, TEXT("上一轮没有及时躲避，连续次数重置。"));
		}

		TrainingLastEnemyAttackTime = NowSeconds;
		TrainingAttackWindowEndTime = NowSeconds + GuideBuddyRuntime::TrainingAttackWindowSeconds;
		bTrainingAttackWindowActive = true;
		bTrainingDamageTakenInWindow = false;
		bTrainingDodgeSeenInWindow = NowSeconds - TrainingLastPlayerDodgeTime <= GuideBuddyRuntime::TrainingPreDodgeGraceSeconds;
		LastTrainingFeedback = bTrainingDodgeSeenInWindow
			? TEXT("翻滚时机已记录，避开这次攻击。")
			: TEXT("敌人出手了，翻滚避开攻击。");
		UpdateDodgeTrainingHud();
	}

	void RegisterDodgeTrainingDodge()
	{
		UWorld* World = ActiveWorld.Get();
		if (!World)
		{
			return;
		}

		const double NowSeconds = World->GetTimeSeconds();
		TrainingLastPlayerDodgeTime = NowSeconds;
		if (bTrainingAttackWindowActive && NowSeconds <= TrainingAttackWindowEndTime)
		{
			bTrainingDodgeSeenInWindow = true;
			LastTrainingFeedback = TEXT("翻滚已记录，确认是否避开攻击。");
			UpdateDodgeTrainingHud();
		}
	}

	void RegisterDodgeTrainingDamage()
	{
		if (!bDodgeTrainingMode || bDodgeTrainingCompleted)
		{
			return;
		}

		bTrainingDamageTakenInWindow = true;
		if (bTrainingAttackWindowActive)
		{
			ResolveDodgeTrainingWindow(false, TEXT("受击了，连续成功次数重置。"));
		}
		else if (ConsecutiveSuccessfulDodges > 0)
		{
			ConsecutiveSuccessfulDodges = 0;
			LastTrainingFeedback = TEXT("受击了，连续成功次数重置。");
			UpdateDodgeTrainingHud();
		}
	}

	void ResolveDodgeTrainingWindow(bool bSuccess, const FString& Feedback)
	{
		if (!bDodgeTrainingMode || bDodgeTrainingCompleted)
		{
			return;
		}

		bTrainingAttackWindowActive = false;
		bTrainingDodgeSeenInWindow = false;
		bTrainingDamageTakenInWindow = false;
		LastTrainingFeedback = Feedback;

		if (bSuccess)
		{
			ConsecutiveSuccessfulDodges = FMath::Clamp(ConsecutiveSuccessfulDodges + 1, 0, RequiredSuccessfulDodges);
		}
		else
		{
			ConsecutiveSuccessfulDodges = 0;
		}

		UpdateDodgeTrainingHud();
		if (ConsecutiveSuccessfulDodges >= RequiredSuccessfulDodges)
		{
			bDodgeTrainingCompleted = true;
			if (Bridge.IsValid())
			{
				Bridge->ShowDodgeTrainingCompleteDialog(RequiredSuccessfulDodges);
			}
		}
	}

	void UpdateDodgeTrainingHud()
	{
		if (Bridge.IsValid())
		{
			Bridge->ShowDodgeTrainingHud(ConsecutiveSuccessfulDodges, RequiredSuccessfulDodges, LastTrainingFeedback);
		}
	}

	float ApplyDodgeTrainingAttributeGuard(
		AActor* Actor,
		UTempestBaseAttributeObject* Attribute,
		float CurrentValue,
		const float* PreviousValue)
	{
		if (!bDodgeTrainingMode || !Attribute)
		{
			return CurrentValue;
		}

		const FString AttributeTag = GuideBuddyRuntime::TagToString(Attribute->AttributeGameplayTag);
		if (!GuideBuddyRuntime::IsTrainingProtectedAttributeTag(AttributeTag))
		{
			return CurrentValue;
		}

		if (Bridge.IsValid() &&
			Bridge->GetActorRole(Actor) == TEXT("player") &&
			PreviousValue &&
			CurrentValue < *PreviousValue - 0.001f)
		{
			RegisterDodgeTrainingDamage();
		}

		const float SafeValue = FMath::Max(Attribute->AttributeValues.MaxAttributeValue, GuideBuddyRuntime::TrainingSafeAttributeValue);
		Attribute->AttributeValues.MaxAttributeValue = SafeValue;
		if (!FMath::IsNearlyEqual(Attribute->AttributeValues.AttributeValue, SafeValue, 0.001f))
		{
			Attribute->AttributeValues.AttributeValue = SafeValue;
			Attribute->OnValueUpdated.Broadcast(Attribute->AttributeGameplayTag);
		}

		return SafeValue;
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
				const float GuardedValue = ApplyDodgeTrainingAttributeGuard(Actor, Attribute, CurrentValue, nullptr);
				LastAttributeValues.Add(AttributeKey, GuardedValue);
				continue;
			}

			if (!FMath::IsNearlyEqual(*PreviousValue, CurrentValue, 0.001f))
			{
				EmitAttributeChanged(Actor, Attribute, *PreviousValue, CurrentValue);
			}

			const float GuardedValue = ApplyDodgeTrainingAttributeGuard(Actor, Attribute, CurrentValue, PreviousValue);
			LastAttributeValues.Add(AttributeKey, GuardedValue);
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
	TStrongObjectPtr<UGuideBuddyCombatControlBridge> CombatControlBridge;
	TSharedPtr<PUERTS_NAMESPACE::FJsEnv> JsEnv;

	TSet<FObjectKey> BoundInputComponents;
	TMap<FObjectKey, TWeakObjectPtr<UTempestBaseAbilityObject>> LastActiveAbilities;
	TMap<FObjectKey, TWeakObjectPtr<UTempestBaseStateObject>> LastActiveStates;
	TMap<FObjectKey, FGameplayTagContainer> LastCombatStatuses;
	TMap<FObjectKey, float> LastAttributeValues;
	double LastDiscoveryPlatformSeconds = 0.0;
	bool bDodgeTrainingMode = false;
	bool bDodgeTrainingCompleted = false;
	bool bTrainingAttackWindowActive = false;
	bool bTrainingDodgeSeenInWindow = false;
	bool bTrainingDamageTakenInWindow = false;
	int32 RequiredSuccessfulDodges = 5;
	int32 ConsecutiveSuccessfulDodges = 0;
	double TrainingLastEnemyAttackTime = -1000.0;
	double TrainingAttackWindowEndTime = -1000.0;
	double TrainingLastPlayerDodgeTime = -1000.0;
	FString LastTrainingFeedback;
};

IMPLEMENT_MODULE(FGuideBuddyRuntimeModule, GuideBuddyRuntime)
