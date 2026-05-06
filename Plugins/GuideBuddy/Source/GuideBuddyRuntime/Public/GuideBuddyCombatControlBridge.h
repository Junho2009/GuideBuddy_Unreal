#pragma once

#include "CoreMinimal.h"
#include "InputCoreTypes.h"
#include "UObject/Object.h"
#include "GuideBuddyCombatControlBridge.generated.h"

class AActor;
class APlayerController;
class APawn;
class UInputAction;
class UTempestBaseInputComponent;
class UTempestBaseStateManagerComponent;
class UWorld;

UCLASS(BlueprintType)
class GUIDEBUDDYRUNTIME_API UGuideBuddyCombatControlBridge : public UObject
{
	GENERATED_BODY()

public:
	void Initialize(UWorld* InWorld);
	void Shutdown();
	void TickControl(float DeltaTime);

	bool HandleInputActionGate(UTempestBaseInputComponent* InputComponent, UInputAction* InputAction, bool& bCanProceed);

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Combat Control")
	void SetSoulslikeControlsEnabled(bool bEnabled);

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Combat Control")
	void ConfigureSoulslikeControls(
		float InMoveDeadZone,
		float InLateralPriorityRatio,
		float InActionPrimeWindowSeconds,
		bool bInLockFacingEnabled,
		bool bInManageDodgeInput,
		bool bInManageAttackInput,
		bool bInManageTargetInput);

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Combat Control")
	FString HandlePlayerInput(const FString& InputName, const FString& TriggerEvent, const FString& WatchListTag);

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Combat Control")
	bool RequestDodge();

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Combat Control")
	bool RequestLightAttack();

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Combat Control")
	bool RequestToggleTargetLock();

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Combat Control")
	bool RequestFaceLockedTarget();

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Combat Control")
	FString GetCombatControlSnapshotJson() const;

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Combat Control")
	FString GetLastError() const { return LastError; }

private:
	enum class EDodgeDirection : uint8
	{
		Forward,
		Backward,
		Left,
		Right
	};

	APawn* GetPlayerPawn() const;
	APlayerController* GetPlayerController() const;
	AActor* GetTargetedActor() const;
	UTempestBaseStateManagerComponent* GetPlayerStateManager() const;
	bool GetIsNativeTargetLockActive() const;

	FVector2D ReadMoveInput() const;
	EDodgeDirection ClassifyDodgeDirection(const FVector2D& MoveInput) const;
	float GetDesiredDodgeAngle(EDodgeDirection Direction) const;
	FString GetDodgeDirectionName(EDodgeDirection Direction) const;
	bool PrimeDodgeDirection();
	bool ApplyLockedTargetFacing(bool bForce);
	bool AcquireBestTarget(AActor*& OutTargetActor) const;
	bool IsValidLockTarget(const AActor* Actor) const;
	bool IsPreferredTargetActor(const AActor* Actor) const;
	FVector GetTargetFocusLocation(const AActor* TargetActor) const;
	void ClearNativeTargetLock(const FString& Reason);
	void SaveRotationSettingsIfNeeded();
	void RestoreRotationSettings();
	bool PerformPlayerStateByTag(const FName& StateTagName);
	bool IsInputActionNamed(const UInputAction* InputAction, const TCHAR* ExpectedName) const;
	FString BuildSnapshotJson(const FString& Source) const;
	void SetError(const FString& ErrorMessage) const;

private:
	TWeakObjectPtr<UWorld> WorldPtr;

	bool bSoulslikeControlsEnabled = true;
	bool bLockFacingEnabled = true;
	bool bManageDodgeInput = true;
	bool bManageAttackInput = true;
	bool bManageTargetInput = true;
	bool bWasTargetLockKeyDown = false;
	bool bNativeTargetLockActive = false;
	TWeakObjectPtr<AActor> NativeLockedTargetActor;
	bool bHasSavedRotationSettings = false;
	bool bSavedOrientRotationToMovement = true;
	bool bSavedUseControllerRotationYaw = false;

	float MoveDeadZone = 0.2f;
	float LateralPriorityRatio = 0.65f;
	float ActionPrimeWindowSeconds = 0.28f;
	float LockBreakDistance = 5200.0f;
	float PrimeControlYaw = 0.0f;
	float PrimeUntilWorldSeconds = 0.0f;
	bool bHasPrimeControlYaw = false;

	mutable FString LastError;
	FString LastHandledInputName;
	FString LastHandledTriggerEvent;
	EDodgeDirection LastDodgeDirection = EDodgeDirection::Backward;
};
