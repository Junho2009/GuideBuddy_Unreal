#pragma once

#include "CoreMinimal.h"
#include "GameplayTagContainer.h"
#include "InputAction.h"
#include "UObject/Object.h"
#include "GuideBuddyTelemetryBridge.generated.h"

class AActor;
class FJsonObject;
class STextBlock;
class SWidget;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FGuideBuddyTelemetrySignal, FString, SignalJson);

UCLASS(BlueprintType)
class GUIDEBUDDYRUNTIME_API UGuideBuddyTelemetryBridge : public UObject
{
	GENERATED_BODY()

public:
	UPROPERTY(BlueprintAssignable, Category = "GuideBuddy|Telemetry")
	FGuideBuddyTelemetrySignal OnTelemetrySignal;

	void Initialize(UWorld* InWorld);
	void EmitBridgeStarted();
	void EmitBridgeShutdown(const FString& Reason);
	void EmitGuideRequest(const FString& Source);
	void EmitSignal(const FString& SignalType, const TSharedPtr<FJsonObject>& Payload);

	TSharedPtr<FJsonObject> BuildActorObject(const AActor* Actor) const;
	TSharedPtr<FJsonObject> BuildObjectObject(const UObject* Object) const;
	FString GetActorRole(const AActor* Actor) const;
	AActor* GetPlayerPawn() const;

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	FString GetInitialContextJson() const;

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	FString GetTelemetryRootDirectory() const;

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	FString GetTelemetryStorageDescription() const;

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	FString GetProjectSavedDirectory() const;

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	FString GetMapName() const;

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	bool CreateDirectoryTree(const FString& AbsolutePath);

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	bool WriteUtf8File(const FString& AbsolutePath, const FString& Contents);

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	FString GetLastError() const { return LastError; }

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	void ShowRuntimeStatusMessage(const FString& Message, bool bSuccess);

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	void ShowBattleEndMenu(const FString& Title, const FString& Message);

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	void ShowCoachingReviewCard(
		const FString& Title,
		const FString& Diagnosis,
		const FString& Evidence,
		const FString& NextAction,
		const FString& SuccessCondition,
		const FString& DrillTemplateId);

	void ShowDodgeTrainingEntryButton();
	void SetDodgeTrainingEntryPointerMode(bool bEnabled);
	void ShowDodgeTrainingHud(int32 SuccessfulDodges, int32 RequiredDodges, const FString& Feedback);
	void ShowDodgeTrainingCompleteDialog(int32 RequiredDodges);
	void RemoveDodgeTrainingWidgets();

	UFUNCTION()
	void HandleBufferedInput(UInputAction* FiredBufferedInput);

	UFUNCTION()
	void HandleWatchListInputChanged(FGameplayTag WatchListTag, UInputAction* ActiveInputAction);

	UFUNCTION()
	void HandleInputTriggerEvent(FInputActionInstance InputActionInstance);

private:
	void RemoveBattleEndMenu();
	void RemoveDodgeTrainingEntryButton();
	void RemoveDodgeTrainingHud();
	void RemoveDodgeTrainingCompleteDialog();
	void EnterDodgeTrainingArena();
	void ReturnToSampleDemoShowcaseMap();
	void RestartChallenge();
	void RequestBattleEndReview();
	bool ShouldEmitInputSignal(const FString& InputKey, double NowSeconds);
	void EmitInputSignal(const FString& Source, UInputAction* InputAction, const FString& TriggerEvent, const FString& WatchListTag);
	FString SerializeJsonObject(const TSharedPtr<FJsonObject>& JsonObject) const;
	double GetWorldTimeSeconds() const;

	TWeakObjectPtr<UWorld> WorldPtr;
	double SessionStartPlatformSeconds = 0.0;
	FString LastError;
	TMap<FString, double> LastInputEmitSecondsByKey;
	TSharedPtr<SWidget> BattleEndWidget;
	TSharedPtr<SWidget> DodgeTrainingEntryWidget;
	bool bDodgeTrainingEntryWidgetAdded = false;
	bool bDodgeTrainingEntryPointerMode = false;
	TSharedPtr<SWidget> DodgeTrainingHudWidget;
	TSharedPtr<SWidget> DodgeTrainingCompleteWidget;
	TSharedPtr<STextBlock> DodgeTrainingCountText;
	TSharedPtr<STextBlock> DodgeTrainingFeedbackText;
};
