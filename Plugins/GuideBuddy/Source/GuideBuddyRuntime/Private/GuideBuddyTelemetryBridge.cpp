#include "GuideBuddyTelemetryBridge.h"

#include "AIController.h"
#include "Dom/JsonObject.h"
#include "GameFramework/Pawn.h"
#include "HAL/FileManager.h"
#include "InputTriggers.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

void UGuideBuddyTelemetryBridge::Initialize(UWorld* InWorld)
{
	WorldPtr = InWorld;
	SessionStartPlatformSeconds = FPlatformTime::Seconds();
	LastError.Reset();
	LastInputEmitSecondsByKey.Reset();
}

void UGuideBuddyTelemetryBridge::EmitBridgeStarted()
{
	const TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
	Payload->SetStringField(TEXT("phase"), TEXT("started"));
	Payload->SetObjectField(TEXT("player"), BuildActorObject(GetPlayerPawn()));
	EmitSignal(TEXT("bridge_started"), Payload);
}

void UGuideBuddyTelemetryBridge::EmitBridgeShutdown(const FString& Reason)
{
	const TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
	Payload->SetStringField(TEXT("reason"), Reason);
	EmitSignal(TEXT("bridge_shutdown"), Payload);
}

void UGuideBuddyTelemetryBridge::EmitSignal(const FString& SignalType, const TSharedPtr<FJsonObject>& Payload)
{
	TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("signal_type"), SignalType);
	Root->SetStringField(TEXT("schema_version"), TEXT("guidebuddy.telemetry.signal.v1"));
	Root->SetNumberField(TEXT("time_seconds"), GetWorldTimeSeconds());
	Root->SetStringField(TEXT("iso_time"), FDateTime::UtcNow().ToIso8601());
	Root->SetStringField(TEXT("map"), GetMapName());

	if (Payload.IsValid())
	{
		Root->SetObjectField(TEXT("payload"), Payload);
	}
	else
	{
		Root->SetObjectField(TEXT("payload"), MakeShared<FJsonObject>());
	}

	OnTelemetrySignal.Broadcast(SerializeJsonObject(Root));
}

TSharedPtr<FJsonObject> UGuideBuddyTelemetryBridge::BuildActorObject(const AActor* Actor) const
{
	TSharedPtr<FJsonObject> ActorObject = BuildObjectObject(Actor);
	ActorObject->SetStringField(TEXT("role"), GetActorRole(Actor));

	if (Actor)
	{
		const FVector Location = Actor->GetActorLocation();
		TSharedPtr<FJsonObject> LocationObject = MakeShared<FJsonObject>();
		LocationObject->SetNumberField(TEXT("x"), Location.X);
		LocationObject->SetNumberField(TEXT("y"), Location.Y);
		LocationObject->SetNumberField(TEXT("z"), Location.Z);
		ActorObject->SetObjectField(TEXT("location"), LocationObject);
	}

	return ActorObject;
}

TSharedPtr<FJsonObject> UGuideBuddyTelemetryBridge::BuildObjectObject(const UObject* Object) const
{
	TSharedPtr<FJsonObject> ObjectJson = MakeShared<FJsonObject>();
	if (!Object)
	{
		ObjectJson->SetBoolField(TEXT("is_valid"), false);
		return ObjectJson;
	}

	ObjectJson->SetBoolField(TEXT("is_valid"), true);
	ObjectJson->SetStringField(TEXT("name"), Object->GetName());
	ObjectJson->SetStringField(TEXT("path"), Object->GetPathName());
	ObjectJson->SetStringField(TEXT("class_name"), Object->GetClass() ? Object->GetClass()->GetName() : TEXT(""));
	ObjectJson->SetStringField(TEXT("class_path"), Object->GetClass() ? Object->GetClass()->GetPathName() : TEXT(""));
	return ObjectJson;
}

FString UGuideBuddyTelemetryBridge::GetActorRole(const AActor* Actor) const
{
	if (!Actor)
	{
		return TEXT("unknown");
	}

	if (Actor == GetPlayerPawn())
	{
		return TEXT("player");
	}

	if (const APawn* Pawn = Cast<APawn>(Actor))
	{
		if (Pawn->GetController() && Pawn->GetController()->IsA<AAIController>())
		{
			return TEXT("enemy");
		}
	}

	const FString ActorIdentity = FString::Printf(TEXT("%s %s %s"),
		*Actor->GetName(),
		*Actor->GetPathName(),
		Actor->GetClass() ? *Actor->GetClass()->GetName() : TEXT(""));

	if (ActorIdentity.Contains(TEXT("Enemy"), ESearchCase::IgnoreCase) ||
		ActorIdentity.Contains(TEXT("_AI"), ESearchCase::IgnoreCase) ||
		ActorIdentity.Contains(TEXT("AI_"), ESearchCase::IgnoreCase))
	{
		return TEXT("enemy");
	}

	return TEXT("unknown");
}

AActor* UGuideBuddyTelemetryBridge::GetPlayerPawn() const
{
	UWorld* World = WorldPtr.Get();
	if (!World)
	{
		return nullptr;
	}

	APlayerController* PlayerController = World->GetFirstPlayerController();
	return PlayerController ? PlayerController->GetPawn() : nullptr;
}

FString UGuideBuddyTelemetryBridge::GetInitialContextJson() const
{
	TSharedPtr<FJsonObject> Context = MakeShared<FJsonObject>();
	Context->SetStringField(TEXT("schema_version"), TEXT("guidebuddy.telemetry.context.v1"));
	Context->SetStringField(TEXT("map"), GetMapName());
	Context->SetStringField(TEXT("iso_time"), FDateTime::UtcNow().ToIso8601());
	Context->SetStringField(TEXT("telemetry_root"), GetTelemetryRootDirectory());
	Context->SetObjectField(TEXT("player"), BuildActorObject(GetPlayerPawn()));
	return SerializeJsonObject(Context);
}

FString UGuideBuddyTelemetryBridge::GetTelemetryRootDirectory() const
{
	FString RootDirectory = FPaths::ProjectSavedDir() / TEXT("GuideBuddy") / TEXT("Telemetry");
	FPaths::NormalizeFilename(RootDirectory);
	return RootDirectory;
}

FString UGuideBuddyTelemetryBridge::GetProjectSavedDirectory() const
{
	FString SavedDirectory = FPaths::ProjectSavedDir();
	FPaths::NormalizeFilename(SavedDirectory);
	return SavedDirectory;
}

FString UGuideBuddyTelemetryBridge::GetMapName() const
{
	if (const UWorld* World = WorldPtr.Get())
	{
		return World->GetMapName();
	}

	return TEXT("");
}

bool UGuideBuddyTelemetryBridge::CreateDirectoryTree(const FString& AbsolutePath)
{
	if (AbsolutePath.IsEmpty())
	{
		LastError = TEXT("CreateDirectoryTree received an empty path.");
		return false;
	}

	const bool bCreated = IFileManager::Get().MakeDirectory(*AbsolutePath, true);
	if (!bCreated)
	{
		LastError = FString::Printf(TEXT("Failed to create directory: %s"), *AbsolutePath);
	}
	return bCreated;
}

bool UGuideBuddyTelemetryBridge::WriteUtf8File(const FString& AbsolutePath, const FString& Contents)
{
	if (AbsolutePath.IsEmpty())
	{
		LastError = TEXT("WriteUtf8File received an empty path.");
		return false;
	}

	const FString Directory = FPaths::GetPath(AbsolutePath);
	if (!Directory.IsEmpty())
	{
		IFileManager::Get().MakeDirectory(*Directory, true);
	}

	const bool bSaved = FFileHelper::SaveStringToFile(
		Contents,
		*AbsolutePath,
		FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);

	if (!bSaved)
	{
		LastError = FString::Printf(TEXT("Failed to write UTF-8 file: %s"), *AbsolutePath);
	}
	return bSaved;
}

void UGuideBuddyTelemetryBridge::HandleBufferedInput(UInputAction* FiredBufferedInput)
{
	EmitInputSignal(TEXT("buffered_input"), FiredBufferedInput, TEXT("Buffered"), TEXT(""));
}

void UGuideBuddyTelemetryBridge::HandleWatchListInputChanged(FGameplayTag WatchListTag, UInputAction* ActiveInputAction)
{
	EmitInputSignal(TEXT("watchlist_input"), ActiveInputAction, ActiveInputAction ? TEXT("Triggered") : TEXT("Released"), WatchListTag.ToString());
}

void UGuideBuddyTelemetryBridge::HandleInputTriggerEvent(FInputActionInstance InputActionInstance)
{
	const UInputAction* SourceAction = InputActionInstance.GetSourceAction();
	if (!SourceAction)
	{
		return;
	}

	const UEnum* TriggerEnum = StaticEnum<ETriggerEvent>();
	const FString TriggerEvent = TriggerEnum
		? TriggerEnum->GetNameStringByValue(static_cast<int64>(InputActionInstance.GetTriggerEvent()))
		: FString::Printf(TEXT("%d"), static_cast<int32>(InputActionInstance.GetTriggerEvent()));

	if (TriggerEvent == TEXT("None") || TriggerEvent == TEXT("Ongoing"))
	{
		return;
	}

	EmitInputSignal(TEXT("input_trigger"), const_cast<UInputAction*>(SourceAction), TriggerEvent, TEXT(""));
}

bool UGuideBuddyTelemetryBridge::ShouldEmitInputSignal(const FString& InputKey, double NowSeconds)
{
	const double* LastEmitSeconds = LastInputEmitSecondsByKey.Find(InputKey);
	if (LastEmitSeconds && NowSeconds - *LastEmitSeconds < 0.15)
	{
		return false;
	}

	LastInputEmitSecondsByKey.Add(InputKey, NowSeconds);
	return true;
}

void UGuideBuddyTelemetryBridge::EmitInputSignal(const FString& Source, UInputAction* InputAction, const FString& TriggerEvent, const FString& WatchListTag)
{
	const double NowSeconds = GetWorldTimeSeconds();
	const FString InputName = InputAction ? InputAction->GetName() : TEXT("<none>");
	const FString InputKey = FString::Printf(TEXT("%s:%s:%s"), *Source, *InputName, *TriggerEvent);

	if (!ShouldEmitInputSignal(InputKey, NowSeconds))
	{
		return;
	}

	TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
	Payload->SetStringField(TEXT("source"), Source);
	Payload->SetStringField(TEXT("input_name"), InputName);
	Payload->SetStringField(TEXT("trigger_event"), TriggerEvent);
	Payload->SetStringField(TEXT("watchlist_tag"), WatchListTag);
	Payload->SetObjectField(TEXT("input"), BuildObjectObject(InputAction));
	Payload->SetObjectField(TEXT("actor"), BuildActorObject(GetPlayerPawn()));
	EmitSignal(TEXT("player_input"), Payload);
}

FString UGuideBuddyTelemetryBridge::SerializeJsonObject(const TSharedPtr<FJsonObject>& JsonObject) const
{
	FString Output;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output);
	FJsonSerializer::Serialize(JsonObject.ToSharedRef(), Writer);
	return Output;
}

double UGuideBuddyTelemetryBridge::GetWorldTimeSeconds() const
{
	if (const UWorld* World = WorldPtr.Get())
	{
		return World->GetTimeSeconds();
	}

	return FPlatformTime::Seconds() - SessionStartPlatformSeconds;
}
