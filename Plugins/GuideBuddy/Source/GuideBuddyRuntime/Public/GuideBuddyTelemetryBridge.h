#pragma once

#include "CoreMinimal.h"
#include "GameplayTagContainer.h"
#include "InputAction.h"
#include "UObject/Object.h"
#include "GuideBuddyTelemetryBridge.generated.h"

class AActor;
class FJsonObject;

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
	FString GetProjectSavedDirectory() const;

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	FString GetMapName() const;

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	bool CreateDirectoryTree(const FString& AbsolutePath);

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	bool WriteUtf8File(const FString& AbsolutePath, const FString& Contents);

	UFUNCTION(BlueprintCallable, Category = "GuideBuddy|Telemetry")
	FString GetLastError() const { return LastError; }

	UFUNCTION()
	void HandleBufferedInput(UInputAction* FiredBufferedInput);

	UFUNCTION()
	void HandleWatchListInputChanged(FGameplayTag WatchListTag, UInputAction* ActiveInputAction);

	UFUNCTION()
	void HandleInputTriggerEvent(FInputActionInstance InputActionInstance);

private:
	bool ShouldEmitInputSignal(const FString& InputKey, double NowSeconds);
	void EmitInputSignal(const FString& Source, UInputAction* InputAction, const FString& TriggerEvent, const FString& WatchListTag);
	FString SerializeJsonObject(const TSharedPtr<FJsonObject>& JsonObject) const;
	double GetWorldTimeSeconds() const;

	TWeakObjectPtr<UWorld> WorldPtr;
	double SessionStartPlatformSeconds = 0.0;
	FString LastError;
	TMap<FString, double> LastInputEmitSecondsByKey;
};
