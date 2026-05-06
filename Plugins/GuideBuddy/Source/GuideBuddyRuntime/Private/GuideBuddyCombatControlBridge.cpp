#include "GuideBuddyCombatControlBridge.h"

#include "AIController.h"
#include "Components/TempestBaseInputComponent.h"
#include "Components/TempestBaseStateManagerComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "GameplayTagAssetInterface.h"
#include "GameplayTagContainer.h"
#include "InputAction.h"
#include "Objects/TempestBaseStateObject.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace GuideBuddyCombatControl
{
static FString SerializeJsonObject(const TSharedPtr<FJsonObject>& JsonObject)
{
	FString Output;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
	FJsonSerializer::Serialize(JsonObject.ToSharedRef(), Writer);
	return Output;
}

static float NormalizeYaw(float Yaw)
{
	return FRotator::NormalizeAxis(Yaw);
}

static bool IsTriggerStartLike(const FString& TriggerEvent)
{
	return TriggerEvent.Contains(TEXT("Started")) || TriggerEvent.Contains(TEXT("Triggered"));
}
}

void UGuideBuddyCombatControlBridge::Initialize(UWorld* InWorld)
{
	WorldPtr = InWorld;
	LastError.Reset();
	LastHandledInputName.Reset();
	LastHandledTriggerEvent.Reset();
	bSoulslikeControlsEnabled = true;
	bNativeTargetLockActive = false;
	NativeLockedTargetActor.Reset();
	bHasPrimeControlYaw = false;
	bHasSavedRotationSettings = false;
}

void UGuideBuddyCombatControlBridge::Shutdown()
{
	ClearNativeTargetLock(TEXT(""));
	WorldPtr.Reset();
	bHasPrimeControlYaw = false;
	bHasSavedRotationSettings = false;
}

void UGuideBuddyCombatControlBridge::TickControl(float)
{
	if (!bSoulslikeControlsEnabled)
	{
		return;
	}

	if (bManageTargetInput)
	{
		APlayerController* PlayerController = GetPlayerController();
		const bool bTargetLockKeyDown = PlayerController && PlayerController->IsInputKeyDown(EKeys::F);
		if (bTargetLockKeyDown && !bWasTargetLockKeyDown)
		{
			RequestToggleTargetLock();
		}
		bWasTargetLockKeyDown = bTargetLockKeyDown;
	}

	if (bNativeTargetLockActive)
	{
		APawn* PlayerPawn = GetPlayerPawn();
		AActor* TargetActor = NativeLockedTargetActor.Get();
		const bool bTargetTooFar = PlayerPawn && TargetActor
			&& FVector::DistSquared2D(PlayerPawn->GetActorLocation(), TargetActor->GetActorLocation()) > FMath::Square(LockBreakDistance);
		if (!PlayerPawn || !IsValidLockTarget(TargetActor) || bTargetTooFar)
		{
			ClearNativeTargetLock(TEXT("target lost"));
		}
		else if (bLockFacingEnabled)
		{
			ApplyLockedTargetFacing(false);
		}
	}
}

void UGuideBuddyCombatControlBridge::SetSoulslikeControlsEnabled(bool bEnabled)
{
	if (!bEnabled)
	{
		ClearNativeTargetLock(TEXT(""));
	}
	bSoulslikeControlsEnabled = bEnabled;
}

void UGuideBuddyCombatControlBridge::ConfigureSoulslikeControls(
	float InMoveDeadZone,
	float InLateralPriorityRatio,
	float InActionPrimeWindowSeconds,
	bool bInLockFacingEnabled,
	bool bInManageDodgeInput,
	bool bInManageAttackInput,
	bool bInManageTargetInput)
{
	MoveDeadZone = FMath::Clamp(InMoveDeadZone, 0.0f, 0.95f);
	LateralPriorityRatio = FMath::Clamp(InLateralPriorityRatio, 0.0f, 1.0f);
	ActionPrimeWindowSeconds = FMath::Clamp(InActionPrimeWindowSeconds, 0.02f, 1.0f);
	bLockFacingEnabled = bInLockFacingEnabled;
	bManageDodgeInput = bInManageDodgeInput;
	bManageAttackInput = bInManageAttackInput;
	bManageTargetInput = bInManageTargetInput;
}

bool UGuideBuddyCombatControlBridge::HandleInputActionGate(
	UTempestBaseInputComponent* InputComponent,
	UInputAction* InputAction,
	bool& bCanProceed)
{
	bCanProceed = true;
	if (!bSoulslikeControlsEnabled || !InputComponent || !InputAction)
	{
		return false;
	}

	const APawn* PlayerPawn = GetPlayerPawn();
	if (!PlayerPawn || InputComponent->GetOwner() != PlayerPawn)
	{
		return false;
	}

	LastHandledInputName = InputAction->GetName();
	LastHandledTriggerEvent = TEXT("gate");

	if (bManageDodgeInput && IsInputActionNamed(InputAction, TEXT("Dodge_Input")))
	{
		const bool bHandled = RequestDodge();
		bCanProceed = !bHandled;
		return bHandled;
	}

	if (bManageAttackInput && IsInputActionNamed(InputAction, TEXT("Attack_Input")))
	{
		const bool bHandled = RequestLightAttack();
		bCanProceed = !bHandled;
		return bHandled;
	}

	if (bManageTargetInput && IsInputActionNamed(InputAction, TEXT("Target_Input")))
	{
		const bool bHandled = RequestToggleTargetLock();
		bCanProceed = !bHandled;
		return bHandled;
	}

	return false;
}

FString UGuideBuddyCombatControlBridge::HandlePlayerInput(
	const FString& InputName,
	const FString& TriggerEvent,
	const FString&)
{
	LastHandledInputName = InputName;
	LastHandledTriggerEvent = TriggerEvent;

	if (!bSoulslikeControlsEnabled || !GuideBuddyCombatControl::IsTriggerStartLike(TriggerEvent))
	{
		return BuildSnapshotJson(TEXT("observed"));
	}

	if (InputName.Equals(TEXT("Dodge_Input"), ESearchCase::IgnoreCase))
	{
		PrimeDodgeDirection();
		ApplyLockedTargetFacing(true);
		return BuildSnapshotJson(TEXT("prime_dodge"));
	}

	if (InputName.Equals(TEXT("Attack_Input"), ESearchCase::IgnoreCase))
	{
		ApplyLockedTargetFacing(true);
		return BuildSnapshotJson(TEXT("prime_attack"));
	}

	return BuildSnapshotJson(TEXT("observed"));
}

bool UGuideBuddyCombatControlBridge::RequestDodge()
{
	if (!bSoulslikeControlsEnabled)
	{
		return false;
	}

	PrimeDodgeDirection();
	ApplyLockedTargetFacing(true);
	return PerformPlayerStateByTag(TEXT("State.Dodge"));
}

bool UGuideBuddyCombatControlBridge::RequestLightAttack()
{
	if (!bSoulslikeControlsEnabled)
	{
		return false;
	}

	ApplyLockedTargetFacing(true);
	return PerformPlayerStateByTag(TEXT("State.Attack"));
}

bool UGuideBuddyCombatControlBridge::RequestToggleTargetLock()
{
	const bool bShouldTarget = !GetIsNativeTargetLockActive();
	if (!bShouldTarget)
	{
		ClearNativeTargetLock(TEXT("target lock off"));
		return true;
	}

	AActor* TargetActor = nullptr;
	if (!AcquireBestTarget(TargetActor) || !TargetActor)
	{
		SetError(TEXT("No targetable enemy found near the camera forward direction."));
		return false;
	}

	NativeLockedTargetActor = TargetActor;
	bNativeTargetLockActive = true;
	LastError.Reset();
	SaveRotationSettingsIfNeeded();

	ApplyLockedTargetFacing(true);
	if (GEngine)
	{
		GEngine->AddOnScreenDebugMessage(-1, 1.5f, FColor::Green, FString::Printf(TEXT("GuideBuddy: locked %s"), *TargetActor->GetName()));
	}

	return true;
}

bool UGuideBuddyCombatControlBridge::RequestFaceLockedTarget()
{
	return ApplyLockedTargetFacing(true);
}

FString UGuideBuddyCombatControlBridge::GetCombatControlSnapshotJson() const
{
	return BuildSnapshotJson(TEXT("snapshot"));
}

APawn* UGuideBuddyCombatControlBridge::GetPlayerPawn() const
{
	UWorld* World = WorldPtr.Get();
	if (!World)
	{
		return nullptr;
	}

	APlayerController* PlayerController = World->GetFirstPlayerController();
	return PlayerController ? PlayerController->GetPawn() : nullptr;
}

APlayerController* UGuideBuddyCombatControlBridge::GetPlayerController() const
{
	UWorld* World = WorldPtr.Get();
	return World ? World->GetFirstPlayerController() : nullptr;
}

AActor* UGuideBuddyCombatControlBridge::GetTargetedActor() const
{
	return GetIsNativeTargetLockActive() ? NativeLockedTargetActor.Get() : nullptr;
}

UTempestBaseStateManagerComponent* UGuideBuddyCombatControlBridge::GetPlayerStateManager() const
{
	APawn* PlayerPawn = GetPlayerPawn();
	if (!PlayerPawn)
	{
		return nullptr;
	}

	return PlayerPawn->FindComponentByClass<UTempestBaseStateManagerComponent>();
}

bool UGuideBuddyCombatControlBridge::GetIsNativeTargetLockActive() const
{
	return bNativeTargetLockActive && NativeLockedTargetActor.IsValid();
}

FVector2D UGuideBuddyCombatControlBridge::ReadMoveInput() const
{
	APlayerController* PlayerController = GetPlayerController();
	if (!PlayerController)
	{
		return FVector2D::ZeroVector;
	}

	float X = 0.0f;
	float Y = 0.0f;

	if (PlayerController->IsInputKeyDown(EKeys::A))
	{
		X -= 1.0f;
	}
	if (PlayerController->IsInputKeyDown(EKeys::D))
	{
		X += 1.0f;
	}
	if (PlayerController->IsInputKeyDown(EKeys::W))
	{
		Y += 1.0f;
	}
	if (PlayerController->IsInputKeyDown(EKeys::S))
	{
		Y -= 1.0f;
	}

	X += PlayerController->GetInputAnalogKeyState(EKeys::Gamepad_LeftX);
	Y += PlayerController->GetInputAnalogKeyState(EKeys::Gamepad_LeftY);

	return FVector2D(FMath::Clamp(X, -1.0f, 1.0f), FMath::Clamp(Y, -1.0f, 1.0f));
}

UGuideBuddyCombatControlBridge::EDodgeDirection UGuideBuddyCombatControlBridge::ClassifyDodgeDirection(
	const FVector2D& MoveInput) const
{
	if (MoveInput.Size() < MoveDeadZone)
	{
		return EDodgeDirection::Backward;
	}

	const float AbsX = FMath::Abs(MoveInput.X);
	const float AbsY = FMath::Abs(MoveInput.Y);

	if (AbsX >= AbsY * LateralPriorityRatio && AbsX > MoveDeadZone)
	{
		return MoveInput.X < 0.0f ? EDodgeDirection::Left : EDodgeDirection::Right;
	}

	return MoveInput.Y < 0.0f ? EDodgeDirection::Backward : EDodgeDirection::Forward;
}

float UGuideBuddyCombatControlBridge::GetDesiredDodgeAngle(EDodgeDirection Direction) const
{
	switch (Direction)
	{
	case EDodgeDirection::Forward:
		return 0.0f;
	case EDodgeDirection::Backward:
		return 180.0f;
	case EDodgeDirection::Left:
		return -90.0f;
	case EDodgeDirection::Right:
		return 90.0f;
	default:
		return 180.0f;
	}
}

FString UGuideBuddyCombatControlBridge::GetDodgeDirectionName(EDodgeDirection Direction) const
{
	switch (Direction)
	{
	case EDodgeDirection::Forward:
		return TEXT("forward");
	case EDodgeDirection::Backward:
		return TEXT("backward");
	case EDodgeDirection::Left:
		return TEXT("left");
	case EDodgeDirection::Right:
		return TEXT("right");
	default:
		return TEXT("backward");
	}
}

bool UGuideBuddyCombatControlBridge::PrimeDodgeDirection()
{
	const FVector2D MoveInput = ReadMoveInput();
	LastDodgeDirection = ClassifyDodgeDirection(MoveInput);
	bHasPrimeControlYaw = false;

	UWorld* World = WorldPtr.Get();
	APawn* PlayerPawn = GetPlayerPawn();
	AActor* TargetActor = GetTargetedActor();
	if (!World || !PlayerPawn || !TargetActor)
	{
		return false;
	}

	const FVector ToTarget = TargetActor->GetActorLocation() - PlayerPawn->GetActorLocation();
	if (ToTarget.SizeSquared2D() <= KINDA_SMALL_NUMBER)
	{
		return false;
	}

	PrimeUntilWorldSeconds = World->GetTimeSeconds() + ActionPrimeWindowSeconds;
	if (MoveInput.Size() >= MoveDeadZone)
	{
		const float InputAngle = FMath::RadiansToDegrees(FMath::Atan2(MoveInput.X, MoveInput.Y));
		const float DesiredAngle = GetDesiredDodgeAngle(LastDodgeDirection);
		const float TargetYaw = ToTarget.Rotation().Yaw;
		PrimeControlYaw = GuideBuddyCombatControl::NormalizeYaw(TargetYaw + DesiredAngle - InputAngle);
		bHasPrimeControlYaw = true;
	}

	return true;
}

bool UGuideBuddyCombatControlBridge::ApplyLockedTargetFacing(bool bForce)
{
	APawn* PlayerPawn = GetPlayerPawn();
	APlayerController* PlayerController = GetPlayerController();
	AActor* TargetActor = GetTargetedActor();
	if (!PlayerPawn || !PlayerController || !TargetActor)
	{
		return false;
	}

	const FVector TargetFocusLocation = GetTargetFocusLocation(TargetActor);
	const FVector ToTarget = TargetFocusLocation - PlayerPawn->GetActorLocation();
	if (ToTarget.SizeSquared2D() <= KINDA_SMALL_NUMBER)
	{
		return false;
	}

	const float TargetYaw = ToTarget.Rotation().Yaw;
	UWorld* World = WorldPtr.Get();
	const bool bUsePrimeYaw = World && bHasPrimeControlYaw && World->GetTimeSeconds() <= PrimeUntilWorldSeconds;
	const float ControlYaw = bUsePrimeYaw ? PrimeControlYaw : TargetYaw;

	FVector ViewLocation = PlayerPawn->GetActorLocation();
	FRotator ViewRotation = PlayerController->GetControlRotation();
	PlayerController->GetPlayerViewPoint(ViewLocation, ViewRotation);
	const FRotator TargetLookRotation = (TargetFocusLocation - ViewLocation).Rotation();

	FRotator ControlRotation = PlayerController->GetControlRotation();
	ControlRotation.Yaw = ControlYaw;
	ControlRotation.Pitch = FMath::Clamp(TargetLookRotation.Pitch, -35.0f, 35.0f);
	ControlRotation.Roll = 0.0f;
	PlayerController->SetControlRotation(ControlRotation);

	if (bLockFacingEnabled || bForce)
	{
		SaveRotationSettingsIfNeeded();

		FRotator ActorRotation = PlayerPawn->GetActorRotation();
		ActorRotation.Pitch = 0.0f;
		ActorRotation.Yaw = TargetYaw;
		ActorRotation.Roll = 0.0f;
		PlayerPawn->SetActorRotation(ActorRotation);

		if (ACharacter* Character = Cast<ACharacter>(PlayerPawn))
		{
			if (UCharacterMovementComponent* MovementComponent = Character->GetCharacterMovement())
			{
				MovementComponent->bOrientRotationToMovement = false;
			}
			Character->bUseControllerRotationYaw = true;
		}
	}

	return true;
}

bool UGuideBuddyCombatControlBridge::AcquireBestTarget(AActor*& OutTargetActor) const
{
	OutTargetActor = nullptr;

	UWorld* World = WorldPtr.Get();
	APawn* PlayerPawn = GetPlayerPawn();
	APlayerController* PlayerController = GetPlayerController();
	if (!World || !PlayerPawn || !PlayerController)
	{
		return false;
	}

	const FVector PlayerLocation = PlayerPawn->GetActorLocation();
	FVector ViewLocation = PlayerLocation;
	FRotator ViewRotation = PlayerController->GetControlRotation();
	PlayerController->GetPlayerViewPoint(ViewLocation, ViewRotation);

	FVector ViewForward = ViewRotation.Vector();
	ViewForward.Z = 0.0f;
	ViewForward.Normalize();
	if (ViewForward.IsNearlyZero())
	{
		ViewForward = PlayerPawn->GetActorForwardVector();
		ViewForward.Z = 0.0f;
		ViewForward.Normalize();
	}

	static constexpr float MaxTargetDistance = 4500.0f;
	static constexpr float MinForwardDot = -0.25f;
	float BestScore = -FLT_MAX;

	for (TActorIterator<AActor> ActorIt(World); ActorIt; ++ActorIt)
	{
		AActor* Actor = *ActorIt;
		if (!IsValidLockTarget(Actor))
		{
			continue;
		}

		const bool bPreferredTarget = IsPreferredTargetActor(Actor);
		const FVector TargetLocation = GetTargetFocusLocation(Actor);
		const float Distance = FVector::Dist2D(PlayerLocation, TargetLocation);
		if (Distance > MaxTargetDistance)
		{
			continue;
		}

		FVector ToTarget = TargetLocation - ViewLocation;
		ToTarget.Z = 0.0f;
		if (!ToTarget.Normalize())
		{
			continue;
		}

		const float ForwardDot = FVector::DotProduct(ViewForward, ToTarget);
		if (ForwardDot < MinForwardDot)
		{
			continue;
		}

		const float Score = (ForwardDot * 3000.0f) - Distance + (bPreferredTarget ? 1250.0f : 0.0f);
		if (Score > BestScore)
		{
			BestScore = Score;
			OutTargetActor = Actor;
		}
	}

	return OutTargetActor != nullptr;
}

bool UGuideBuddyCombatControlBridge::IsValidLockTarget(const AActor* Actor) const
{
	const APawn* PlayerPawn = GetPlayerPawn();
	if (!Actor || !IsValid(Actor) || Actor == PlayerPawn || Actor->IsHidden())
	{
		return false;
	}

	if (IsPreferredTargetActor(Actor))
	{
		return true;
	}

	if (Actor->ActorHasTag(FName(TEXT("Enemy"))) || Actor->ActorHasTag(FName(TEXT("Targetable"))))
	{
		return true;
	}

	const FString ActorName = Actor->GetName();
	if (ActorName.Contains(TEXT("Enemy"), ESearchCase::IgnoreCase) || ActorName.Contains(TEXT("Monster"), ESearchCase::IgnoreCase))
	{
		return true;
	}

	return false;
}

bool UGuideBuddyCombatControlBridge::IsPreferredTargetActor(const AActor* Actor) const
{
	if (!Actor)
	{
		return false;
	}

	const FGameplayTag AITag = FGameplayTag::RequestGameplayTag(FName(TEXT("Character.AI")), false);
	const IGameplayTagAssetInterface* GameplayTagAsset = Cast<IGameplayTagAssetInterface>(Actor);
	if (GameplayTagAsset && AITag.IsValid())
	{
		FGameplayTagContainer OwnedTags;
		GameplayTagAsset->GetOwnedGameplayTags(OwnedTags);
		if (OwnedTags.HasTag(AITag))
		{
			return true;
		}
	}

	const APawn* Pawn = Cast<APawn>(Actor);
	return Pawn && Pawn->GetController() && Pawn->GetController()->IsA<AAIController>();
}

FVector UGuideBuddyCombatControlBridge::GetTargetFocusLocation(const AActor* TargetActor) const
{
	if (!TargetActor)
	{
		return FVector::ZeroVector;
	}

	FVector Origin = TargetActor->GetActorLocation();
	FVector Extent = FVector::ZeroVector;
	TargetActor->GetActorBounds(true, Origin, Extent);
	if (!Extent.IsNearlyZero())
	{
		Origin.Z += FMath::Clamp(Extent.Z * 0.2f, 35.0f, 120.0f);
	}
	return Origin;
}

void UGuideBuddyCombatControlBridge::ClearNativeTargetLock(const FString& Reason)
{
	const bool bWasLocked = bNativeTargetLockActive || NativeLockedTargetActor.IsValid();
	NativeLockedTargetActor.Reset();
	bNativeTargetLockActive = false;
	bHasPrimeControlYaw = false;
	RestoreRotationSettings();

	if (bWasLocked && !Reason.IsEmpty() && GEngine)
	{
		const FColor MessageColor = Reason.Equals(TEXT("target lock off"), ESearchCase::IgnoreCase) ? FColor::Yellow : FColor::Orange;
		GEngine->AddOnScreenDebugMessage(-1, 1.5f, MessageColor, FString::Printf(TEXT("GuideBuddy: %s"), *Reason));
	}
}

void UGuideBuddyCombatControlBridge::SaveRotationSettingsIfNeeded()
{
	if (bHasSavedRotationSettings)
	{
		return;
	}

	ACharacter* Character = Cast<ACharacter>(GetPlayerPawn());
	if (!Character)
	{
		return;
	}

	bSavedUseControllerRotationYaw = Character->bUseControllerRotationYaw;
	if (UCharacterMovementComponent* MovementComponent = Character->GetCharacterMovement())
	{
		bSavedOrientRotationToMovement = MovementComponent->bOrientRotationToMovement;
	}
	bHasSavedRotationSettings = true;
}

void UGuideBuddyCombatControlBridge::RestoreRotationSettings()
{
	if (!bHasSavedRotationSettings)
	{
		return;
	}

	if (ACharacter* Character = Cast<ACharacter>(GetPlayerPawn()))
	{
		Character->bUseControllerRotationYaw = bSavedUseControllerRotationYaw;
		if (UCharacterMovementComponent* MovementComponent = Character->GetCharacterMovement())
		{
			MovementComponent->bOrientRotationToMovement = bSavedOrientRotationToMovement;
		}
	}
	bHasSavedRotationSettings = false;
}

bool UGuideBuddyCombatControlBridge::PerformPlayerStateByTag(const FName& StateTagName)
{
	UTempestBaseStateManagerComponent* StateManager = GetPlayerStateManager();
	if (!StateManager)
	{
		SetError(TEXT("Player has no TempestBaseStateManagerComponent."));
		return false;
	}

	const FGameplayTag StateTag = FGameplayTag::RequestGameplayTag(StateTagName, false);
	if (!StateTag.IsValid())
	{
		SetError(FString::Printf(TEXT("Missing gameplay tag: %s"), *StateTagName.ToString()));
		return false;
	}

	UTempestBaseStateObject* State = StateManager->GetStateOfGameplayTag(StateTag);
	if (!State)
	{
		SetError(FString::Printf(TEXT("Player has no state for tag: %s"), *StateTagName.ToString()));
		return false;
	}

	const bool bPerformed = StateManager->TryPerformStateOfClass(State->GetClass(), true);
	if (!bPerformed)
	{
		SetError(FString::Printf(TEXT("State rejected activation: %s"), *StateTagName.ToString()));
	}

	return bPerformed;
}

bool UGuideBuddyCombatControlBridge::IsInputActionNamed(const UInputAction* InputAction, const TCHAR* ExpectedName) const
{
	return InputAction && InputAction->GetName().Equals(ExpectedName, ESearchCase::IgnoreCase);
}

FString UGuideBuddyCombatControlBridge::BuildSnapshotJson(const FString& Source) const
{
	const FVector2D MoveInput = ReadMoveInput();
	const AActor* TargetActor = GetTargetedActor();

	TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("source"), Source);
	Root->SetBoolField(TEXT("enabled"), bSoulslikeControlsEnabled);
	Root->SetStringField(TEXT("last_input_name"), LastHandledInputName);
	Root->SetStringField(TEXT("last_trigger_event"), LastHandledTriggerEvent);
	Root->SetStringField(TEXT("last_dodge_direction"), GetDodgeDirectionName(LastDodgeDirection));
	Root->SetNumberField(TEXT("move_x"), MoveInput.X);
	Root->SetNumberField(TEXT("move_y"), MoveInput.Y);
	Root->SetBoolField(TEXT("is_targeting"), GetIsNativeTargetLockActive());
	Root->SetBoolField(TEXT("native_target_lock_active"), bNativeTargetLockActive);
	Root->SetStringField(TEXT("target_name"), TargetActor ? TargetActor->GetName() : TEXT(""));
	Root->SetStringField(TEXT("last_error"), LastError);

	return GuideBuddyCombatControl::SerializeJsonObject(Root);
}

void UGuideBuddyCombatControlBridge::SetError(const FString& ErrorMessage) const
{
	LastError = ErrorMessage;
	UE_LOG(LogTemp, Warning, TEXT("[GuideBuddyCombatControl] %s"), *ErrorMessage);
	if (GEngine)
	{
		GEngine->AddOnScreenDebugMessage(-1, 2.5f, FColor::Red, FString::Printf(TEXT("GuideBuddy lock: %s"), *ErrorMessage));
	}
}
