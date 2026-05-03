#pragma once

#include "CoreMinimal.h"
#include "Json.h"

/**
 * Handler class for Widget Blueprint-related MCP commands.
 */
class FEpicUnrealMCPWidgetCommands
{
public:
    FEpicUnrealMCPWidgetCommands();

    TSharedPtr<FJsonObject> HandleCommand(const FString& CommandType, const TSharedPtr<FJsonObject>& Params);

private:
    TSharedPtr<FJsonObject> HandleAddWidgetToUserWidget(const TSharedPtr<FJsonObject>& Params);
    TSharedPtr<FJsonObject> HandleCreateWidgetFromLayout(const TSharedPtr<FJsonObject>& Params);
    TSharedPtr<FJsonObject> HandleEditWidgetProperty(const TSharedPtr<FJsonObject>& Params);
    TSharedPtr<FJsonObject> HandleGetBatchWidgetProperties(const TSharedPtr<FJsonObject>& Params);
};
