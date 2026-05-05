#include "GuideBuddyTelemetryBridge.h"

#include "AIController.h"
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformProcess.h"
#include "InputTriggers.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "Styling/CoreStyle.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSeparator.h"
#include "Widgets/SOverlay.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Text/STextBlock.h"

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

void UGuideBuddyTelemetryBridge::EmitGuideRequest(const FString& Source)
{
	const TSharedPtr<FJsonObject> Payload = MakeShared<FJsonObject>();
	Payload->SetStringField(TEXT("source"), Source);
	Payload->SetStringField(TEXT("reason"), Source == TEXT("battle_end_review_button")
		? TEXT("battle_end_review_requested")
		: TEXT("player_requested_guidance"));
	Payload->SetStringField(TEXT("button"), Source == TEXT("battle_end_review_button")
		? TEXT("ReviewButton")
		: TEXT("RuntimeRequest"));
	Payload->SetObjectField(TEXT("actor"), BuildActorObject(GetPlayerPawn()));
	EmitSignal(TEXT("guide_request"), Payload);
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
	Context->SetStringField(TEXT("telemetry_storage"), GetTelemetryStorageDescription());
	Context->SetObjectField(TEXT("player"), BuildActorObject(GetPlayerPawn()));
	return SerializeJsonObject(Context);
}

FString UGuideBuddyTelemetryBridge::GetTelemetryRootDirectory() const
{
	FString RootDirectory;
#if WITH_EDITOR
	RootDirectory = FPaths::ProjectSavedDir() / TEXT("GuideBuddy") / TEXT("Telemetry");
#else
	RootDirectory = FString(FPlatformProcess::BaseDir()) / TEXT("GuideBuddy") / TEXT("Telemetry");
#endif
	FPaths::NormalizeFilename(RootDirectory);
	return RootDirectory;
}

FString UGuideBuddyTelemetryBridge::GetTelemetryStorageDescription() const
{
#if WITH_EDITOR
	return TEXT("project_saved_directory");
#else
	return TEXT("executable_directory");
#endif
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

void UGuideBuddyTelemetryBridge::ShowRuntimeStatusMessage(const FString& Message, bool bSuccess)
{
	UE_LOG(LogTemp, Log, TEXT("[GuideBuddy] %s"), *Message);

	if (GEngine)
	{
		const FColor MessageColor = bSuccess ? FColor::Green : FColor::Red;
		GEngine->AddOnScreenDebugMessage(-1, 6.0f, MessageColor, FString::Printf(TEXT("GuideBuddy: %s"), *Message));
	}
}

void UGuideBuddyTelemetryBridge::ShowBattleEndMenu(const FString& Title, const FString& Message)
{
	RemoveBattleEndMenu();

	TWeakObjectPtr<UGuideBuddyTelemetryBridge> WeakThis(this);
	const FLinearColor PanelBackground(0.0f, 0.0f, 0.0f, 0.85f);
	const FLinearColor MutedText(0.78f, 0.82f, 0.88f, 1.0f);
	const FLinearColor PrimaryButton(0.20f, 0.42f, 0.95f, 1.0f);
	const FLinearColor SecondaryButton(0.16f, 0.18f, 0.22f, 1.0f);

	BattleEndWidget = SNew(SOverlay)
		+ SOverlay::Slot()
		.HAlign(HAlign_Fill)
		.VAlign(VAlign_Fill)
		[
			SNew(SBorder)
			.BorderBackgroundColor(FLinearColor(0.0f, 0.0f, 0.0f, 0.82f))
			.Padding(0)
			[
				SNew(SBox)
				.HAlign(HAlign_Center)
				.VAlign(VAlign_Center)
				[
					SNew(SBox)
					.WidthOverride(760.0f)
					[
						SNew(SBorder)
						.BorderBackgroundColor(PanelBackground)
						.Padding(FMargin(40.0f, 34.0f))
						[
							SNew(SVerticalBox)
							+ SVerticalBox::Slot()
							.AutoHeight()
							[
								SNew(STextBlock)
								.Text(FText::FromString(Title.IsEmpty() ? TEXT("战斗结束") : Title))
								.Font(FCoreStyle::GetDefaultFontStyle("Bold", 32))
								.ColorAndOpacity(FLinearColor::White)
							]
							+ SVerticalBox::Slot()
							.AutoHeight()
							.Padding(0.0f, 12.0f, 0.0f, 28.0f)
							[
								SNew(STextBlock)
								.Text(FText::FromString(Message))
								.Font(FCoreStyle::GetDefaultFontStyle("Regular", 18))
								.ColorAndOpacity(MutedText)
								.WrapTextAt(680.0f)
								.LineHeightPercentage(1.25f)
							]
							+ SVerticalBox::Slot()
							.AutoHeight()
							[
								SNew(SHorizontalBox)
								+ SHorizontalBox::Slot()
								.FillWidth(1.0f)
								.Padding(0.0f, 0.0f, 14.0f, 0.0f)
								[
									SNew(SButton)
									.ButtonColorAndOpacity(SecondaryButton)
									.ContentPadding(FMargin(18.0f, 12.0f))
									.OnClicked_Lambda([WeakThis]()
									{
										if (WeakThis.IsValid())
										{
											WeakThis->RestartChallenge();
										}
										return FReply::Handled();
									})
									[
										SNew(SBox)
										.HAlign(HAlign_Center)
										[
											SNew(STextBlock)
											.Text(FText::FromString(TEXT("重新挑战")))
											.Font(FCoreStyle::GetDefaultFontStyle("Bold", 18))
											.ColorAndOpacity(FLinearColor::White)
										]
									]
								]
								+ SHorizontalBox::Slot()
								.FillWidth(1.0f)
								[
									SNew(SButton)
									.ButtonColorAndOpacity(PrimaryButton)
									.ContentPadding(FMargin(18.0f, 12.0f))
									.OnClicked_Lambda([WeakThis]()
									{
										if (WeakThis.IsValid())
										{
											WeakThis->RequestBattleEndReview();
										}
										return FReply::Handled();
									})
									[
										SNew(SBox)
										.HAlign(HAlign_Center)
										[
											SNew(STextBlock)
											.Text(FText::FromString(TEXT("复盘一下")))
											.Font(FCoreStyle::GetDefaultFontStyle("Bold", 18))
											.ColorAndOpacity(FLinearColor::White)
										]
									]
								]
							]
						]
					]
				]
			]
		];

	if (GEngine && GEngine->GameViewport && BattleEndWidget.IsValid())
	{
		GEngine->GameViewport->AddViewportWidgetContent(BattleEndWidget.ToSharedRef(), 1000);
	}

	if (UWorld* World = WorldPtr.Get())
	{
		if (APlayerController* PlayerController = World->GetFirstPlayerController())
		{
			FInputModeUIOnly InputMode;
			InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
			PlayerController->SetInputMode(InputMode);
			PlayerController->SetShowMouseCursor(true);
		}
	}
}

void UGuideBuddyTelemetryBridge::ShowCoachingReviewCard(
	const FString& Title,
	const FString& Diagnosis,
	const FString& Evidence,
	const FString& NextAction,
	const FString& SuccessCondition,
	const FString& DrillTemplateId)
{
	RemoveBattleEndMenu();

	TWeakObjectPtr<UGuideBuddyTelemetryBridge> WeakThis(this);
	const FLinearColor PanelBackground(0.0f, 0.0f, 0.0f, 0.85f);
	const FLinearColor LabelText(0.48f, 0.66f, 1.0f, 1.0f);
	const FLinearColor BodyText(0.9f, 0.93f, 0.96f, 1.0f);
	const FLinearColor MutedText(0.74f, 0.8f, 0.88f, 1.0f);
	const FLinearColor ActionText(0.77f, 0.96f, 0.74f, 1.0f);
	const FLinearColor ButtonColor(0.20f, 0.42f, 0.95f, 1.0f);

	BattleEndWidget = SNew(SOverlay)
		+ SOverlay::Slot()
		.HAlign(HAlign_Fill)
		.VAlign(VAlign_Fill)
		[
			SNew(SBorder)
			.BorderBackgroundColor(FLinearColor(0.0f, 0.0f, 0.0f, 0.84f))
			.Padding(0)
			[
				SNew(SBox)
				.HAlign(HAlign_Center)
				.VAlign(VAlign_Center)
				[
					SNew(SBox)
					.WidthOverride(820.0f)
					.MaxDesiredHeight(620.0f)
					[
						SNew(SBorder)
						.BorderBackgroundColor(PanelBackground)
						.Padding(FMargin(42.0f, 34.0f))
						[
							SNew(SVerticalBox)
							+ SVerticalBox::Slot()
							.AutoHeight()
							[
								SNew(STextBlock)
								.Text(FText::FromString(Title.IsEmpty() ? TEXT("本局复盘") : Title))
								.Font(FCoreStyle::GetDefaultFontStyle("Bold", 30))
								.ColorAndOpacity(FLinearColor::White)
							]
							+ SVerticalBox::Slot()
							.AutoHeight()
							.Padding(0.0f, 18.0f, 0.0f, 0.0f)
							[
								SNew(SSeparator)
								.Thickness(1.0f)
							]
							+ SVerticalBox::Slot()
							.FillHeight(1.0f)
							.Padding(0.0f, 20.0f, 0.0f, 22.0f)
							[
								SNew(SScrollBox)
								+ SScrollBox::Slot()
								[
									SNew(SVerticalBox)
									+ SVerticalBox::Slot()
									.AutoHeight()
									[
										SNew(STextBlock)
										.Text(FText::FromString(TEXT("主要问题")))
										.Font(FCoreStyle::GetDefaultFontStyle("Bold", 15))
										.ColorAndOpacity(LabelText)
									]
									+ SVerticalBox::Slot()
									.AutoHeight()
									.Padding(0.0f, 6.0f, 0.0f, 18.0f)
									[
										SNew(STextBlock)
										.Text(FText::FromString(Diagnosis))
										.Font(FCoreStyle::GetDefaultFontStyle("Regular", 19))
										.ColorAndOpacity(BodyText)
										.WrapTextAt(720.0f)
										.LineHeightPercentage(1.25f)
									]
									+ SVerticalBox::Slot()
									.AutoHeight()
									[
										SNew(STextBlock)
										.Text(FText::FromString(TEXT("关键证据")))
										.Font(FCoreStyle::GetDefaultFontStyle("Bold", 15))
										.ColorAndOpacity(LabelText)
									]
									+ SVerticalBox::Slot()
									.AutoHeight()
									.Padding(0.0f, 6.0f, 0.0f, 18.0f)
									[
										SNew(STextBlock)
										.Text(FText::FromString(Evidence))
										.Font(FCoreStyle::GetDefaultFontStyle("Regular", 18))
										.ColorAndOpacity(MutedText)
										.WrapTextAt(720.0f)
										.LineHeightPercentage(1.25f)
									]
									+ SVerticalBox::Slot()
									.AutoHeight()
									[
										SNew(STextBlock)
										.Text(FText::FromString(TEXT("下一局只练")))
										.Font(FCoreStyle::GetDefaultFontStyle("Bold", 15))
										.ColorAndOpacity(LabelText)
									]
									+ SVerticalBox::Slot()
									.AutoHeight()
									.Padding(0.0f, 6.0f, 0.0f, 18.0f)
									[
										SNew(STextBlock)
										.Text(FText::FromString(NextAction))
										.Font(FCoreStyle::GetDefaultFontStyle("Bold", 20))
										.ColorAndOpacity(ActionText)
										.WrapTextAt(720.0f)
										.LineHeightPercentage(1.25f)
									]
									+ SVerticalBox::Slot()
									.AutoHeight()
									[
										SNew(STextBlock)
										.Text(FText::FromString(TEXT("成功条件")))
										.Font(FCoreStyle::GetDefaultFontStyle("Bold", 15))
										.ColorAndOpacity(LabelText)
									]
									+ SVerticalBox::Slot()
									.AutoHeight()
									.Padding(0.0f, 6.0f, 0.0f, 18.0f)
									[
										SNew(STextBlock)
										.Text(FText::FromString(SuccessCondition))
										.Font(FCoreStyle::GetDefaultFontStyle("Regular", 18))
										.ColorAndOpacity(BodyText)
										.WrapTextAt(720.0f)
										.LineHeightPercentage(1.25f)
									]
									+ SVerticalBox::Slot()
									.AutoHeight()
									[
										SNew(STextBlock)
										.Text(FText::FromString(TEXT("针对性练习配置")))
										.Font(FCoreStyle::GetDefaultFontStyle("Bold", 15))
										.ColorAndOpacity(LabelText)
									]
									+ SVerticalBox::Slot()
									.AutoHeight()
									.Padding(0.0f, 6.0f, 0.0f, 0.0f)
									[
										SNew(STextBlock)
										.Text(FText::FromString(DrillTemplateId.IsEmpty() ? TEXT("等待生成") : DrillTemplateId))
										.Font(FCoreStyle::GetDefaultFontStyle("Regular", 18))
										.ColorAndOpacity(MutedText)
										.WrapTextAt(720.0f)
									]
								]
							]
							+ SVerticalBox::Slot()
							.AutoHeight()
							[
								SNew(SButton)
								.ButtonColorAndOpacity(ButtonColor)
								.ContentPadding(FMargin(20.0f, 12.0f))
								.OnClicked_Lambda([WeakThis]()
								{
									if (WeakThis.IsValid())
									{
										WeakThis->RestartChallenge();
									}
									return FReply::Handled();
								})
								[
									SNew(SBox)
									.HAlign(HAlign_Center)
									[
										SNew(STextBlock)
										.Text(FText::FromString(TEXT("重新挑战")))
										.Font(FCoreStyle::GetDefaultFontStyle("Bold", 18))
										.ColorAndOpacity(FLinearColor::White)
									]
								]
							]
						]
					]
				]
			]
		];

	if (GEngine && GEngine->GameViewport && BattleEndWidget.IsValid())
	{
		GEngine->GameViewport->AddViewportWidgetContent(BattleEndWidget.ToSharedRef(), 1000);
	}

	if (UWorld* World = WorldPtr.Get())
	{
		if (APlayerController* PlayerController = World->GetFirstPlayerController())
		{
			FInputModeUIOnly InputMode;
			InputMode.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
			PlayerController->SetInputMode(InputMode);
			PlayerController->SetShowMouseCursor(true);
		}
	}
}

void UGuideBuddyTelemetryBridge::RemoveBattleEndMenu()
{
	if (GEngine && GEngine->GameViewport && BattleEndWidget.IsValid())
	{
		GEngine->GameViewport->RemoveViewportWidgetContent(BattleEndWidget.ToSharedRef());
	}
	BattleEndWidget.Reset();
}

void UGuideBuddyTelemetryBridge::RestartChallenge()
{
	RemoveBattleEndMenu();

	UWorld* World = WorldPtr.Get();
	if (!World)
	{
		return;
	}

	if (APlayerController* PlayerController = World->GetFirstPlayerController())
	{
		PlayerController->SetInputMode(FInputModeGameOnly());
		PlayerController->SetShowMouseCursor(false);
	}

	const FString CurrentLevelName = UGameplayStatics::GetCurrentLevelName(World, true);
	UGameplayStatics::OpenLevel(World, FName(*CurrentLevelName), false);
}

void UGuideBuddyTelemetryBridge::RequestBattleEndReview()
{
	ShowRuntimeStatusMessage(TEXT("正在复盘这一局..."), true);
	EmitGuideRequest(TEXT("battle_end_review_button"));
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
