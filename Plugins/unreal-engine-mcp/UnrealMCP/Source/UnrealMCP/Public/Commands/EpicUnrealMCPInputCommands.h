#pragma once

#include "CoreMinimal.h"
#include "Json.h"

/**
 * Handler for Enhanced Input asset MCP commands.
 * create_input_action, ensure_input_mapping_context, add_mapping_to_imc.
 */
class UNREALMCP_API FEpicUnrealMCPInputCommands
{
public:
	FEpicUnrealMCPInputCommands();

	TSharedPtr<FJsonObject> HandleCommand(const FString& CommandType, const TSharedPtr<FJsonObject>& Params);

private:
	TSharedPtr<FJsonObject> HandleCreateInputAction(const TSharedPtr<FJsonObject>& Params);
	TSharedPtr<FJsonObject> HandleEnsureInputMappingContext(const TSharedPtr<FJsonObject>& Params);
	TSharedPtr<FJsonObject> HandleAddMappingToIMC(const TSharedPtr<FJsonObject>& Params);
};
