#include "Commands/EpicUnrealMCPInputCommands.h"
#include "Commands/EpicUnrealMCPCommonUtils.h"
#include "EditorAssetLibrary.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "Factories/DataAssetFactory.h"
#include "Misc/Paths.h"

FEpicUnrealMCPInputCommands::FEpicUnrealMCPInputCommands()
{
}

TSharedPtr<FJsonObject> FEpicUnrealMCPInputCommands::HandleCommand(const FString& CommandType, const TSharedPtr<FJsonObject>& Params)
{
	if (CommandType == TEXT("create_input_action"))
	{
		return HandleCreateInputAction(Params);
	}
	if (CommandType == TEXT("ensure_input_mapping_context"))
	{
		return HandleEnsureInputMappingContext(Params);
	}
	if (CommandType == TEXT("add_mapping_to_imc"))
	{
		return HandleAddMappingToIMC(Params);
	}
	return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Unknown input command: %s"), *CommandType));
}

TSharedPtr<FJsonObject> FEpicUnrealMCPInputCommands::HandleCreateInputAction(const TSharedPtr<FJsonObject>& Params)
{
	FString Name;
	if (!Params->TryGetStringField(TEXT("name"), Name))
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'name' parameter"));
	}
	FString ValueTypeStr;
	if (!Params->TryGetStringField(TEXT("value_type"), ValueTypeStr))
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'value_type' parameter"));
	}
	FString SavePath;
	if (!Params->TryGetStringField(TEXT("save_path"), SavePath))
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'save_path' parameter"));
	}

	SavePath.ReplaceInline(TEXT("\\"), TEXT("/"));
	if (SavePath.EndsWith(TEXT("/")))
	{
		SavePath.LeftChopInline(1);
	}

	if (UEditorAssetLibrary::DoesAssetExist(SavePath))
	{
		TSharedPtr<FJsonObject> ResultObj = MakeShared<FJsonObject>();
		ResultObj->SetStringField(TEXT("path"), SavePath);
		return ResultObj;
	}

	EInputActionValueType ValueType = EInputActionValueType::Boolean;
	if (ValueTypeStr.Equals(TEXT("bool"), ESearchCase::IgnoreCase))
	{
		ValueType = EInputActionValueType::Boolean;
	}
	else if (ValueTypeStr.Equals(TEXT("axis1d"), ESearchCase::IgnoreCase))
	{
		ValueType = EInputActionValueType::Axis1D;
	}
	else if (ValueTypeStr.Equals(TEXT("axis2d"), ESearchCase::IgnoreCase))
	{
		ValueType = EInputActionValueType::Axis2D;
	}
	else
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Invalid value_type: %s (use bool, axis1d, axis2d)"), *ValueTypeStr));
	}

	FString AssetName = FPaths::GetBaseFilename(SavePath);
	if (AssetName.IsEmpty())
	{
		AssetName = Name;
	}

	UPackage* Package = CreatePackage(*SavePath);
	if (!Package)
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Failed to create package: %s"), *SavePath));
	}

	UDataAssetFactory* Factory = NewObject<UDataAssetFactory>();
	Factory->DataAssetClass = UInputAction::StaticClass();
	UObject* NewAsset = Factory->FactoryCreateNew(UInputAction::StaticClass(), Package, FName(*AssetName), RF_Standalone | RF_Public, nullptr, GWarn);
	UInputAction* InputAction = Cast<UInputAction>(NewAsset);
	if (!InputAction)
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Failed to create InputAction asset"));
	}

	InputAction->ValueType = ValueType;
	FAssetRegistryModule::AssetCreated(InputAction);
	Package->MarkPackageDirty();
	UEditorAssetLibrary::SaveLoadedAsset(InputAction);

	TSharedPtr<FJsonObject> ResultObj = MakeShared<FJsonObject>();
	ResultObj->SetStringField(TEXT("path"), SavePath);
	return ResultObj;
}

TSharedPtr<FJsonObject> FEpicUnrealMCPInputCommands::HandleEnsureInputMappingContext(const TSharedPtr<FJsonObject>& Params)
{
	FString ImcPath;
	if (!Params->TryGetStringField(TEXT("imc_path"), ImcPath))
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'imc_path' parameter"));
	}

	ImcPath.ReplaceInline(TEXT("\\"), TEXT("/"));
	if (ImcPath.EndsWith(TEXT("/")))
	{
		ImcPath.LeftChopInline(1);
	}

	if (UEditorAssetLibrary::DoesAssetExist(ImcPath))
	{
		TSharedPtr<FJsonObject> ResultObj = MakeShared<FJsonObject>();
		ResultObj->SetStringField(TEXT("path"), ImcPath);
		return ResultObj;
	}

	FString AssetName = FPaths::GetBaseFilename(ImcPath);
	if (AssetName.IsEmpty())
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Invalid imc_path: could not get asset name"));
	}

	UPackage* Package = CreatePackage(*ImcPath);
	if (!Package)
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Failed to create package: %s"), *ImcPath));
	}

	UDataAssetFactory* Factory = NewObject<UDataAssetFactory>();
	Factory->DataAssetClass = UInputMappingContext::StaticClass();
	UObject* NewAsset = Factory->FactoryCreateNew(UInputMappingContext::StaticClass(), Package, FName(*AssetName), RF_Standalone | RF_Public, nullptr, GWarn);
	UInputMappingContext* IMC = Cast<UInputMappingContext>(NewAsset);
	if (!IMC)
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Failed to create InputMappingContext asset"));
	}

	FAssetRegistryModule::AssetCreated(IMC);
	Package->MarkPackageDirty();
	UEditorAssetLibrary::SaveLoadedAsset(IMC);

	TSharedPtr<FJsonObject> ResultObj = MakeShared<FJsonObject>();
	ResultObj->SetStringField(TEXT("path"), ImcPath);
	return ResultObj;
}

TSharedPtr<FJsonObject> FEpicUnrealMCPInputCommands::HandleAddMappingToIMC(const TSharedPtr<FJsonObject>& Params)
{
	FString ImcPath;
	if (!Params->TryGetStringField(TEXT("imc_path"), ImcPath))
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'imc_path' parameter"));
	}
	FString IaPath;
	if (!Params->TryGetStringField(TEXT("ia_path"), IaPath))
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'ia_path' parameter"));
	}
	FString KeyStr;
	if (!Params->TryGetStringField(TEXT("key"), KeyStr))
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'key' parameter"));
	}

	UInputMappingContext* IMC = Cast<UInputMappingContext>(UEditorAssetLibrary::LoadAsset(ImcPath));
	if (!IMC)
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("InputMappingContext not found: %s"), *ImcPath));
	}
	UInputAction* IA = Cast<UInputAction>(UEditorAssetLibrary::LoadAsset(IaPath));
	if (!IA)
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("InputAction not found: %s"), *IaPath));
	}

	FName keyName(*KeyStr);
	FKey keyToMap = FKey(keyName);
	if (!keyToMap.IsValid())
	{
		return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Invalid key: %s"), *KeyStr));
	}

	const TArray<FEnhancedActionKeyMapping>& Mappings = IMC->GetMappings();
	for (const FEnhancedActionKeyMapping& Mapping : Mappings)
	{
		if (Mapping.Action == IA)
		{
			TSharedPtr<FJsonObject> ResultObj = MakeShared<FJsonObject>();
			ResultObj->SetStringField(TEXT("path"), ImcPath);
			return ResultObj;
		}
	}

	IMC->MapKey(IA, keyToMap);
	IMC->MarkPackageDirty();
	UEditorAssetLibrary::SaveLoadedAsset(IMC);

	TSharedPtr<FJsonObject> ResultObj = MakeShared<FJsonObject>();
	ResultObj->SetStringField(TEXT("path"), ImcPath);
	return ResultObj;
}
