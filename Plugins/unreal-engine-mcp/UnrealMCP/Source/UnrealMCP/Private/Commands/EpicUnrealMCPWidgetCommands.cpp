#include "Commands/EpicUnrealMCPWidgetCommands.h"
#include "Commands/EpicUnrealMCPCommonUtils.h"
#include "Blueprint/UserWidget.h"
#include "Blueprint/WidgetTree.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/ContentWidget.h"
#include "Components/PanelWidget.h"
#include "Components/Widget.h"
#include "EditorAssetLibrary.h"
#include "Kismet2/BlueprintEditorUtils.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "Widgets/Layout/Anchors.h"
#include "Layout/Margin.h"
#include "Misc/PackageName.h"
#include "Styling/SlateColor.h"
#include "UObject/FieldIterator.h"
#include "UObject/UnrealType.h"
#include "WidgetBlueprint.h"

namespace
{
FString NormalizeAssetObjectPath(const FString& AssetPath)
{
    if (AssetPath.IsEmpty() || !AssetPath.StartsWith(TEXT("/")) || AssetPath.Contains(TEXT(".")))
    {
        return AssetPath;
    }

    const FString AssetName = FPackageName::GetLongPackageAssetName(AssetPath);
    return FString::Printf(TEXT("%s.%s"), *AssetPath, *AssetName);
}

UWidgetBlueprint* LoadWidgetBlueprintAsset(const FString& WidgetPathOrName)
{
    if (WidgetPathOrName.IsEmpty())
    {
        return nullptr;
    }

    if (WidgetPathOrName.StartsWith(TEXT("/")))
    {
        if (UWidgetBlueprint* WidgetBlueprint = LoadObject<UWidgetBlueprint>(nullptr, *NormalizeAssetObjectPath(WidgetPathOrName)))
        {
            return WidgetBlueprint;
        }
    }

    return Cast<UWidgetBlueprint>(FEpicUnrealMCPCommonUtils::FindBlueprintByName(WidgetPathOrName));
}

UClass* ResolveClassByName(const FString& RawName)
{
    if (RawName.IsEmpty())
    {
        return nullptr;
    }

    if (RawName.StartsWith(TEXT("/Script/")) || RawName.StartsWith(TEXT("/Game/")))
    {
        if (UClass* DirectClass = LoadClass<UObject>(nullptr, *RawName))
        {
            return DirectClass;
        }
    }

    TArray<FString> Candidates = { RawName };
    if (!RawName.StartsWith(TEXT("U")))
    {
        Candidates.Add(TEXT("U") + RawName);
    }

    for (const FString& Candidate : Candidates)
    {
        if (UClass* FoundClass = FindFirstObjectSafe<UClass>(*Candidate))
        {
            return FoundClass;
        }
    }

    const FString NativeName = RawName.StartsWith(TEXT("U")) ? RawName.RightChop(1) : RawName;
    const TArray<FString> Modules = { TEXT("UMG"), TEXT("CommonUI"), TEXT("Engine"), TEXT("SlateCore") };
    for (const FString& ModuleName : Modules)
    {
        const FString ScriptPath = FString::Printf(TEXT("/Script/%s.%s"), *ModuleName, *NativeName);
        if (UClass* LoadedClass = LoadClass<UObject>(nullptr, *ScriptPath))
        {
            return LoadedClass;
        }
    }

    return nullptr;
}

FProperty* FindPropertyLoose(UStruct* Struct, const FString& PropertyName)
{
    if (!Struct)
    {
        return nullptr;
    }

    if (FProperty* ExactProperty = Struct->FindPropertyByName(FName(*PropertyName)))
    {
        return ExactProperty;
    }

    for (TFieldIterator<FProperty> It(Struct); It; ++It)
    {
        if (It->GetName().Equals(PropertyName, ESearchCase::IgnoreCase))
        {
            return *It;
        }
    }

    return nullptr;
}

UWidget* FindWidgetLoose(UWidgetTree* WidgetTree, const FString& WidgetName)
{
    if (!WidgetTree || WidgetName.IsEmpty())
    {
        return nullptr;
    }

    if (UWidget* ExactWidget = WidgetTree->FindWidget(FName(*WidgetName)))
    {
        return ExactWidget;
    }

    TArray<UWidget*> Widgets;
    WidgetTree->GetAllWidgets(Widgets);
    for (UWidget* Widget : Widgets)
    {
        if (Widget && Widget->GetName().Equals(WidgetName, ESearchCase::IgnoreCase))
        {
            return Widget;
        }
    }

    return nullptr;
}

TSharedPtr<FJsonObject> NormalizeWidgetDef(const TSharedPtr<FJsonObject>& WidgetDef)
{
    if (!WidgetDef.IsValid())
    {
        return nullptr;
    }

    if (WidgetDef->HasField(TEXT("type")) || WidgetDef->HasField(TEXT("widget_type")) || WidgetDef->HasField(TEXT("class")))
    {
        return WidgetDef;
    }

    for (const auto& Pair : WidgetDef->Values)
    {
        const TSharedPtr<FJsonObject>* NestedObject = nullptr;
        if (!Pair.Value->TryGetObject(NestedObject) || !NestedObject || !NestedObject->IsValid())
        {
            continue;
        }

        if ((*NestedObject)->HasField(TEXT("type")) || (*NestedObject)->HasField(TEXT("widget_type")) || (*NestedObject)->HasField(TEXT("class")))
        {
            TSharedPtr<FJsonObject> Normalized = MakeShared<FJsonObject>();
            for (const auto& NestedPair : (*NestedObject)->Values)
            {
                Normalized->SetField(NestedPair.Key, NestedPair.Value);
            }

            if (!Normalized->HasField(TEXT("name")) && !Normalized->HasField(TEXT("widget_name")))
            {
                Normalized->SetStringField(TEXT("name"), Pair.Key);
            }
            return Normalized;
        }
    }

    return WidgetDef;
}

void FlattenWidgetLayout(const TSharedPtr<FJsonObject>& WidgetDef, const FString& ParentName, TArray<TSharedPtr<FJsonObject>>& OutFlatLayout)
{
    const TSharedPtr<FJsonObject> Normalized = NormalizeWidgetDef(WidgetDef);
    if (!Normalized.IsValid())
    {
        return;
    }

    TSharedPtr<FJsonObject> FlatWidget = MakeShared<FJsonObject>();
    for (const auto& Pair : Normalized->Values)
    {
        if (Pair.Key != TEXT("children"))
        {
            FlatWidget->SetField(Pair.Key, Pair.Value);
        }
    }
    if (!ParentName.IsEmpty())
    {
        FlatWidget->SetStringField(TEXT("parent_name"), ParentName);
    }
    OutFlatLayout.Add(FlatWidget);

    FString ThisName;
    if (!Normalized->TryGetStringField(TEXT("widget_name"), ThisName))
    {
        Normalized->TryGetStringField(TEXT("name"), ThisName);
    }

    const TArray<TSharedPtr<FJsonValue>>* Children = nullptr;
    if (Normalized->TryGetArrayField(TEXT("children"), Children) && Children)
    {
        for (const TSharedPtr<FJsonValue>& ChildValue : *Children)
        {
            const TSharedPtr<FJsonObject>* ChildObject = nullptr;
            if (ChildValue.IsValid() && ChildValue->TryGetObject(ChildObject) && ChildObject)
            {
                FlattenWidgetLayout(*ChildObject, ThisName, OutFlatLayout);
            }
        }
    }
}

FString JsonValueToString(const TSharedPtr<FJsonValue>& Value)
{
    if (!Value.IsValid())
    {
        return FString();
    }

    if (Value->Type == EJson::String)
    {
        return Value->AsString();
    }
    if (Value->Type == EJson::Number)
    {
        return FString::SanitizeFloat(Value->AsNumber());
    }
    if (Value->Type == EJson::Boolean)
    {
        return Value->AsBool() ? TEXT("true") : TEXT("false");
    }
    if (Value->Type == EJson::Array)
    {
        TArray<FString> Parts;
        for (const TSharedPtr<FJsonValue>& Entry : Value->AsArray())
        {
            Parts.Add(JsonValueToString(Entry));
        }
        return FString::Printf(TEXT("(%s)"), *FString::Join(Parts, TEXT(",")));
    }

    return FString();
}

bool JsonValueToBool(const TSharedPtr<FJsonValue>& Value, bool& OutValue)
{
    if (!Value.IsValid())
    {
        return false;
    }
    if (Value->Type == EJson::Boolean)
    {
        OutValue = Value->AsBool();
        return true;
    }
    if (Value->Type == EJson::Number)
    {
        OutValue = !FMath::IsNearlyZero(Value->AsNumber());
        return true;
    }
    if (Value->Type == EJson::String)
    {
        const FString RawValue = Value->AsString().TrimStartAndEnd();
        if (RawValue.Equals(TEXT("true"), ESearchCase::IgnoreCase) || RawValue == TEXT("1"))
        {
            OutValue = true;
            return true;
        }
        if (RawValue.Equals(TEXT("false"), ESearchCase::IgnoreCase) || RawValue == TEXT("0"))
        {
            OutValue = false;
            return true;
        }
    }
    return false;
}

bool JsonValueToInt(const TSharedPtr<FJsonValue>& Value, int32& OutValue)
{
    if (!Value.IsValid())
    {
        return false;
    }
    if (Value->Type == EJson::Number)
    {
        OutValue = FMath::RoundToInt(Value->AsNumber());
        return true;
    }
    if (Value->Type == EJson::String && Value->AsString().IsNumeric())
    {
        OutValue = FCString::Atoi(*Value->AsString());
        return true;
    }
    return false;
}

bool JsonValueToFloat(const TSharedPtr<FJsonValue>& Value, float& OutValue)
{
    if (!Value.IsValid())
    {
        return false;
    }
    if (Value->Type == EJson::Number)
    {
        OutValue = static_cast<float>(Value->AsNumber());
        return true;
    }
    if (Value->Type == EJson::String && Value->AsString().IsNumeric())
    {
        OutValue = FCString::Atof(*Value->AsString());
        return true;
    }
    return false;
}

bool JsonValueToVector2D(const TSharedPtr<FJsonValue>& Value, FVector2D& OutValue)
{
    if (!Value.IsValid())
    {
        return false;
    }
    if (Value->Type == EJson::Array)
    {
        const TArray<TSharedPtr<FJsonValue>>& Items = Value->AsArray();
        if (Items.Num() >= 2)
        {
            OutValue = FVector2D(static_cast<float>(Items[0]->AsNumber()), static_cast<float>(Items[1]->AsNumber()));
            return true;
        }
    }
    if (Value->Type == EJson::Object)
    {
        const TSharedPtr<FJsonObject> ObjectValue = Value->AsObject();
        double X = 0.0;
        double Y = 0.0;
        if (ObjectValue.IsValid() &&
            (ObjectValue->TryGetNumberField(TEXT("x"), X) || ObjectValue->TryGetNumberField(TEXT("X"), X)) &&
            (ObjectValue->TryGetNumberField(TEXT("y"), Y) || ObjectValue->TryGetNumberField(TEXT("Y"), Y)))
        {
            OutValue = FVector2D(static_cast<float>(X), static_cast<float>(Y));
            return true;
        }
    }

    FString RawValue = JsonValueToString(Value).TrimStartAndEnd();
    if (RawValue.StartsWith(TEXT("(")) && RawValue.EndsWith(TEXT(")")))
    {
        RawValue = RawValue.Mid(1, RawValue.Len() - 2);
    }

    TArray<FString> Parts;
    RawValue.ParseIntoArray(Parts, TEXT(","), true);
    if (Parts.Num() >= 2)
    {
        OutValue = FVector2D(FCString::Atof(*Parts[0].TrimStartAndEnd()), FCString::Atof(*Parts[1].TrimStartAndEnd()));
        return true;
    }
    if (Parts.Num() == 1 && Parts[0].TrimStartAndEnd().IsNumeric())
    {
        const float Uniform = FCString::Atof(*Parts[0]);
        OutValue = FVector2D(Uniform, Uniform);
        return true;
    }
    return false;
}

bool JsonValueToMargin(const TSharedPtr<FJsonValue>& Value, FMargin& OutValue)
{
    if (!Value.IsValid())
    {
        return false;
    }
    if (Value->Type == EJson::Number)
    {
        OutValue = FMargin(static_cast<float>(Value->AsNumber()));
        return true;
    }
    if (Value->Type == EJson::Array)
    {
        const TArray<TSharedPtr<FJsonValue>>& Items = Value->AsArray();
        if (Items.Num() == 1)
        {
            OutValue = FMargin(static_cast<float>(Items[0]->AsNumber()));
            return true;
        }
        if (Items.Num() == 2)
        {
            const float Horizontal = static_cast<float>(Items[0]->AsNumber());
            const float Vertical = static_cast<float>(Items[1]->AsNumber());
            OutValue = FMargin(Horizontal, Vertical, Horizontal, Vertical);
            return true;
        }
        if (Items.Num() >= 4)
        {
            OutValue = FMargin(
                static_cast<float>(Items[0]->AsNumber()),
                static_cast<float>(Items[1]->AsNumber()),
                static_cast<float>(Items[2]->AsNumber()),
                static_cast<float>(Items[3]->AsNumber()));
            return true;
        }
    }

    FString RawValue = JsonValueToString(Value).TrimStartAndEnd();
    if (RawValue.StartsWith(TEXT("(")) && RawValue.EndsWith(TEXT(")")))
    {
        RawValue = RawValue.Mid(1, RawValue.Len() - 2);
    }

    TArray<FString> Parts;
    RawValue.ParseIntoArray(Parts, TEXT(","), true);
    if (Parts.Num() == 1)
    {
        OutValue = FMargin(FCString::Atof(*Parts[0].TrimStartAndEnd()));
        return true;
    }
    if (Parts.Num() == 2)
    {
        const float Horizontal = FCString::Atof(*Parts[0].TrimStartAndEnd());
        const float Vertical = FCString::Atof(*Parts[1].TrimStartAndEnd());
        OutValue = FMargin(Horizontal, Vertical, Horizontal, Vertical);
        return true;
    }
    if (Parts.Num() >= 4)
    {
        OutValue = FMargin(
            FCString::Atof(*Parts[0].TrimStartAndEnd()),
            FCString::Atof(*Parts[1].TrimStartAndEnd()),
            FCString::Atof(*Parts[2].TrimStartAndEnd()),
            FCString::Atof(*Parts[3].TrimStartAndEnd()));
        return true;
    }
    return false;
}

bool JsonValueToAnchors(const TSharedPtr<FJsonValue>& Value, FAnchors& OutValue)
{
    if (!Value.IsValid())
    {
        return false;
    }
    if (Value->Type == EJson::Array)
    {
        const TArray<TSharedPtr<FJsonValue>>& Items = Value->AsArray();
        if (Items.Num() >= 4)
        {
            OutValue = FAnchors(
                static_cast<float>(Items[0]->AsNumber()),
                static_cast<float>(Items[1]->AsNumber()),
                static_cast<float>(Items[2]->AsNumber()),
                static_cast<float>(Items[3]->AsNumber()));
            return true;
        }
    }

    const FString RawValue = JsonValueToString(Value).ToLower().TrimStartAndEnd();
    if (RawValue == TEXT("fill") || RawValue == TEXT("fill_screen"))
    {
        OutValue = FAnchors(0.0f, 0.0f, 1.0f, 1.0f);
        return true;
    }
    if (RawValue == TEXT("center"))
    {
        OutValue = FAnchors(0.5f, 0.5f, 0.5f, 0.5f);
        return true;
    }
    if (RawValue == TEXT("top_left") || RawValue == TEXT("topleft"))
    {
        OutValue = FAnchors(0.0f, 0.0f, 0.0f, 0.0f);
        return true;
    }
    if (RawValue == TEXT("top_center") || RawValue == TEXT("topcenter"))
    {
        OutValue = FAnchors(0.5f, 0.0f, 0.5f, 0.0f);
        return true;
    }
    if (RawValue == TEXT("top_right") || RawValue == TEXT("topright"))
    {
        OutValue = FAnchors(1.0f, 0.0f, 1.0f, 0.0f);
        return true;
    }
    if (RawValue == TEXT("bottom_left") || RawValue == TEXT("bottomleft"))
    {
        OutValue = FAnchors(0.0f, 1.0f, 0.0f, 1.0f);
        return true;
    }
    if (RawValue == TEXT("bottom_right") || RawValue == TEXT("bottomright"))
    {
        OutValue = FAnchors(1.0f, 1.0f, 1.0f, 1.0f);
        return true;
    }

    FString WorkingValue = RawValue;
    if (WorkingValue.StartsWith(TEXT("(")) && WorkingValue.EndsWith(TEXT(")")))
    {
        WorkingValue = WorkingValue.Mid(1, WorkingValue.Len() - 2);
    }
    TArray<FString> Parts;
    WorkingValue.ParseIntoArray(Parts, TEXT(","), true);
    if (Parts.Num() >= 4)
    {
        OutValue = FAnchors(
            FCString::Atof(*Parts[0].TrimStartAndEnd()),
            FCString::Atof(*Parts[1].TrimStartAndEnd()),
            FCString::Atof(*Parts[2].TrimStartAndEnd()),
            FCString::Atof(*Parts[3].TrimStartAndEnd()));
        return true;
    }
    return false;
}

bool JsonValueToColor(const TSharedPtr<FJsonValue>& Value, FLinearColor& OutValue)
{
    if (!Value.IsValid())
    {
        return false;
    }
    if (Value->Type == EJson::Array)
    {
        const TArray<TSharedPtr<FJsonValue>>& Items = Value->AsArray();
        if (Items.Num() >= 3)
        {
            OutValue = FLinearColor(
                static_cast<float>(Items[0]->AsNumber()),
                static_cast<float>(Items[1]->AsNumber()),
                static_cast<float>(Items[2]->AsNumber()),
                Items.Num() >= 4 ? static_cast<float>(Items[3]->AsNumber()) : 1.0f);
            return true;
        }
    }

    FString RawValue = JsonValueToString(Value).ToLower().TrimStartAndEnd();
    if (RawValue.IsEmpty())
    {
        return false;
    }
    if (RawValue.StartsWith(TEXT("#")))
    {
        const FString Hex = RawValue.RightChop(1);
        if (Hex.Len() == 6 || Hex.Len() == 8)
        {
            const int32 R = FParse::HexDigit(Hex[0]) * 16 + FParse::HexDigit(Hex[1]);
            const int32 G = FParse::HexDigit(Hex[2]) * 16 + FParse::HexDigit(Hex[3]);
            const int32 B = FParse::HexDigit(Hex[4]) * 16 + FParse::HexDigit(Hex[5]);
            const int32 A = Hex.Len() == 8 ? (FParse::HexDigit(Hex[6]) * 16 + FParse::HexDigit(Hex[7])) : 255;
            OutValue = FLinearColor(R / 255.0f, G / 255.0f, B / 255.0f, A / 255.0f);
            return true;
        }
    }
    if (RawValue == TEXT("white")) { OutValue = FLinearColor::White; return true; }
    if (RawValue == TEXT("black")) { OutValue = FLinearColor::Black; return true; }
    if (RawValue == TEXT("red")) { OutValue = FLinearColor::Red; return true; }
    if (RawValue == TEXT("green")) { OutValue = FLinearColor::Green; return true; }
    if (RawValue == TEXT("blue")) { OutValue = FLinearColor::Blue; return true; }
    if (RawValue == TEXT("yellow")) { OutValue = FLinearColor::Yellow; return true; }
    if (RawValue == TEXT("gray") || RawValue == TEXT("grey")) { OutValue = FLinearColor::Gray; return true; }
    if (RawValue == TEXT("transparent") || RawValue == TEXT("clear")) { OutValue = FLinearColor(0, 0, 0, 0); return true; }

    if (RawValue.StartsWith(TEXT("(")) && RawValue.EndsWith(TEXT(")")))
    {
        RawValue = RawValue.Mid(1, RawValue.Len() - 2);
    }
    TArray<FString> Parts;
    RawValue.ParseIntoArray(Parts, TEXT(","), true);
    if (Parts.Num() >= 3)
    {
        OutValue = FLinearColor(
            FCString::Atof(*Parts[0].TrimStartAndEnd()),
            FCString::Atof(*Parts[1].TrimStartAndEnd()),
            FCString::Atof(*Parts[2].TrimStartAndEnd()),
            Parts.Num() >= 4 ? FCString::Atof(*Parts[3].TrimStartAndEnd()) : 1.0f);
        return true;
    }
    return false;
}

bool ResolveEnumNumericValue(UEnum* EnumDefinition, const TSharedPtr<FJsonValue>& Value, int64& OutValue)
{
    if (!EnumDefinition || !Value.IsValid())
    {
        return false;
    }
    if (Value->Type == EJson::Number)
    {
        OutValue = static_cast<int64>(Value->AsNumber());
        return true;
    }

    FString RawValue = JsonValueToString(Value);
    if (RawValue.IsNumeric())
    {
        OutValue = FCString::Atoi64(*RawValue);
        return true;
    }
    if (RawValue.Contains(TEXT("::")))
    {
        FString LeftPart;
        RawValue.Split(TEXT("::"), &LeftPart, &RawValue, ESearchCase::CaseSensitive, ESearchDir::FromEnd);
    }

    OutValue = EnumDefinition->GetValueByNameString(RawValue);
    return OutValue != INDEX_NONE;
}

bool SetPropertyFromJson(FProperty* Property, void* ContainerPtr, const TSharedPtr<FJsonValue>& Value, FString& OutError)
{
    if (!Property || !ContainerPtr)
    {
        OutError = TEXT("Invalid property container");
        return false;
    }

    void* ValuePtr = Property->ContainerPtrToValuePtr<void>(ContainerPtr);
    if (!ValuePtr)
    {
        OutError = FString::Printf(TEXT("Invalid value pointer for property '%s'"), *Property->GetName());
        return false;
    }

    if (FBoolProperty* BoolProperty = CastField<FBoolProperty>(Property))
    {
        bool BoolValue = false;
        if (!JsonValueToBool(Value, BoolValue))
        {
            OutError = FString::Printf(TEXT("Could not parse bool value for '%s'"), *Property->GetName());
            return false;
        }
        BoolProperty->SetPropertyValue(ValuePtr, BoolValue);
        return true;
    }
    if (FNumericProperty* NumericProperty = CastField<FNumericProperty>(Property))
    {
        if (NumericProperty->IsInteger())
        {
            int32 IntValue = 0;
            if (!JsonValueToInt(Value, IntValue))
            {
                OutError = FString::Printf(TEXT("Could not parse integer value for '%s'"), *Property->GetName());
                return false;
            }
            NumericProperty->SetIntPropertyValue(ValuePtr, static_cast<int64>(IntValue));
            return true;
        }
        float FloatValue = 0.0f;
        if (!JsonValueToFloat(Value, FloatValue))
        {
            OutError = FString::Printf(TEXT("Could not parse float value for '%s'"), *Property->GetName());
            return false;
        }
        NumericProperty->SetFloatingPointPropertyValue(ValuePtr, FloatValue);
        return true;
    }
    if (FStrProperty* StringProperty = CastField<FStrProperty>(Property))
    {
        StringProperty->SetPropertyValue(ValuePtr, JsonValueToString(Value));
        return true;
    }
    if (FNameProperty* NameProperty = CastField<FNameProperty>(Property))
    {
        NameProperty->SetPropertyValue(ValuePtr, FName(*JsonValueToString(Value)));
        return true;
    }
    if (FTextProperty* TextProperty = CastField<FTextProperty>(Property))
    {
        TextProperty->SetPropertyValue(ValuePtr, FText::FromString(JsonValueToString(Value)));
        return true;
    }
    if (FEnumProperty* EnumProperty = CastField<FEnumProperty>(Property))
    {
        int64 EnumValue = 0;
        if (!ResolveEnumNumericValue(EnumProperty->GetEnum(), Value, EnumValue))
        {
            OutError = FString::Printf(TEXT("Could not parse enum value for '%s'"), *Property->GetName());
            return false;
        }
        EnumProperty->GetUnderlyingProperty()->SetIntPropertyValue(ValuePtr, EnumValue);
        return true;
    }
    if (FByteProperty* ByteProperty = CastField<FByteProperty>(Property))
    {
        if (UEnum* EnumDefinition = ByteProperty->GetIntPropertyEnum())
        {
            int64 EnumValue = 0;
            if (!ResolveEnumNumericValue(EnumDefinition, Value, EnumValue))
            {
                OutError = FString::Printf(TEXT("Could not parse enum value for '%s'"), *Property->GetName());
                return false;
            }
            ByteProperty->SetPropertyValue(ValuePtr, static_cast<uint8>(EnumValue));
            return true;
        }
    }
    if (FStructProperty* StructProperty = CastField<FStructProperty>(Property))
    {
        if (StructProperty->Struct == TBaseStructure<FVector2D>::Get())
        {
            FVector2D VectorValue = FVector2D::ZeroVector;
            if (!JsonValueToVector2D(Value, VectorValue))
            {
                OutError = FString::Printf(TEXT("Could not parse FVector2D for '%s'"), *Property->GetName());
                return false;
            }
            *static_cast<FVector2D*>(ValuePtr) = VectorValue;
            return true;
        }
        if (StructProperty->Struct == TBaseStructure<FMargin>::Get())
        {
            FMargin MarginValue;
            if (!JsonValueToMargin(Value, MarginValue))
            {
                OutError = FString::Printf(TEXT("Could not parse FMargin for '%s'"), *Property->GetName());
                return false;
            }
            *static_cast<FMargin*>(ValuePtr) = MarginValue;
            return true;
        }
        if (StructProperty->Struct == TBaseStructure<FAnchors>::Get())
        {
            FAnchors AnchorValue;
            if (!JsonValueToAnchors(Value, AnchorValue))
            {
                OutError = FString::Printf(TEXT("Could not parse FAnchors for '%s'"), *Property->GetName());
                return false;
            }
            *static_cast<FAnchors*>(ValuePtr) = AnchorValue;
            return true;
        }
        if (StructProperty->Struct == TBaseStructure<FLinearColor>::Get())
        {
            FLinearColor ColorValue = FLinearColor::White;
            if (!JsonValueToColor(Value, ColorValue))
            {
                OutError = FString::Printf(TEXT("Could not parse FLinearColor for '%s'"), *Property->GetName());
                return false;
            }
            *static_cast<FLinearColor*>(ValuePtr) = ColorValue;
            return true;
        }
        if (StructProperty->Struct == TBaseStructure<FSlateColor>::Get())
        {
            FLinearColor ColorValue = FLinearColor::White;
            if (!JsonValueToColor(Value, ColorValue))
            {
                OutError = FString::Printf(TEXT("Could not parse FSlateColor for '%s'"), *Property->GetName());
                return false;
            }
            *static_cast<FSlateColor*>(ValuePtr) = FSlateColor(ColorValue);
            return true;
        }
    }

    const FString ImportValue = JsonValueToString(Value);
    if (!ImportValue.IsEmpty() && Property->ImportText_Direct(*ImportValue, ValuePtr, nullptr, PPF_None) != nullptr)
    {
        return true;
    }

    OutError = FString::Printf(TEXT("Unsupported property type '%s' for '%s'"), *Property->GetClass()->GetName(), *Property->GetName());
    return false;
}

bool TryApplySlotAlias(UWidget* Widget, const FString& PropertyPath, const TSharedPtr<FJsonValue>& Value, FString& OutError)
{
    if (!Widget || !PropertyPath.StartsWith(TEXT("Slot."), ESearchCase::IgnoreCase))
    {
        return false;
    }
    UCanvasPanelSlot* CanvasSlot = Cast<UCanvasPanelSlot>(Widget->Slot);
    if (!CanvasSlot)
    {
        return false;
    }

    const FString SlotProperty = PropertyPath.RightChop(5);
    if (SlotProperty.Equals(TEXT("Anchors"), ESearchCase::IgnoreCase))
    {
        FAnchors AnchorValue;
        if (!JsonValueToAnchors(Value, AnchorValue))
        {
            OutError = TEXT("Could not parse Slot.Anchors");
            return true;
        }
        CanvasSlot->SetAnchors(AnchorValue);
        return true;
    }
    if (SlotProperty.Equals(TEXT("Position"), ESearchCase::IgnoreCase))
    {
        FVector2D PositionValue = FVector2D::ZeroVector;
        if (!JsonValueToVector2D(Value, PositionValue))
        {
            OutError = TEXT("Could not parse Slot.Position");
            return true;
        }
        CanvasSlot->SetPosition(PositionValue);
        return true;
    }
    if (SlotProperty.Equals(TEXT("Size"), ESearchCase::IgnoreCase))
    {
        FVector2D SizeValue = FVector2D::ZeroVector;
        if (!JsonValueToVector2D(Value, SizeValue))
        {
            OutError = TEXT("Could not parse Slot.Size");
            return true;
        }
        CanvasSlot->SetSize(SizeValue);
        return true;
    }
    if (SlotProperty.Equals(TEXT("Alignment"), ESearchCase::IgnoreCase))
    {
        FVector2D AlignmentValue = FVector2D::ZeroVector;
        if (!JsonValueToVector2D(Value, AlignmentValue))
        {
            OutError = TEXT("Could not parse Slot.Alignment");
            return true;
        }
        CanvasSlot->SetAlignment(AlignmentValue);
        return true;
    }
    if (SlotProperty.Equals(TEXT("AutoSize"), ESearchCase::IgnoreCase))
    {
        bool bAutoSize = false;
        if (!JsonValueToBool(Value, bAutoSize))
        {
            OutError = TEXT("Could not parse Slot.AutoSize");
            return true;
        }
        CanvasSlot->SetAutoSize(bAutoSize);
        return true;
    }
    if (SlotProperty.Equals(TEXT("ZOrder"), ESearchCase::IgnoreCase))
    {
        int32 ZOrder = 0;
        if (!JsonValueToInt(Value, ZOrder))
        {
            OutError = TEXT("Could not parse Slot.ZOrder");
            return true;
        }
        CanvasSlot->SetZOrder(ZOrder);
        return true;
    }
    return false;
}

bool ApplyWidgetProperty(UWidget* Widget, const FString& PropertyPath, const TSharedPtr<FJsonValue>& Value, FString& OutError)
{
    if (!Widget)
    {
        OutError = TEXT("Invalid widget");
        return false;
    }
    if (PropertyPath.IsEmpty())
    {
        OutError = TEXT("Property path is empty");
        return false;
    }
    if (TryApplySlotAlias(Widget, PropertyPath, Value, OutError))
    {
        return OutError.IsEmpty();
    }

    UObject* PropertyTarget = Widget;
    FString ActualPath = PropertyPath;
    if (PropertyPath.StartsWith(TEXT("Slot."), ESearchCase::IgnoreCase))
    {
        if (!Widget->Slot)
        {
            OutError = FString::Printf(TEXT("Widget '%s' does not have a slot"), *Widget->GetName());
            return false;
        }
        PropertyTarget = Widget->Slot;
        ActualPath = PropertyPath.RightChop(5);
    }

    void* ContainerPtr = PropertyTarget;
    UStruct* ContainerStruct = PropertyTarget->GetClass();
    TArray<FString> PathParts;
    ActualPath.ParseIntoArray(PathParts, TEXT("."), true);
    if (PathParts.Num() == 0)
    {
        OutError = FString::Printf(TEXT("Invalid property path '%s'"), *PropertyPath);
        return false;
    }

    FProperty* FinalProperty = nullptr;
    for (int32 Index = 0; Index < PathParts.Num(); ++Index)
    {
        FinalProperty = FindPropertyLoose(ContainerStruct, PathParts[Index]);
        if (!FinalProperty)
        {
            OutError = FString::Printf(TEXT("Property '%s' not found on '%s'"), *PathParts[Index], *ContainerStruct->GetName());
            return false;
        }
        if (Index == PathParts.Num() - 1)
        {
            break;
        }

        if (FStructProperty* StructProperty = CastField<FStructProperty>(FinalProperty))
        {
            ContainerPtr = FinalProperty->ContainerPtrToValuePtr<void>(ContainerPtr);
            ContainerStruct = StructProperty->Struct;
            if (!ContainerPtr || !ContainerStruct)
            {
                OutError = FString::Printf(TEXT("Failed to traverse property path '%s'"), *PropertyPath);
                return false;
            }
            continue;
        }

        OutError = FString::Printf(TEXT("Property '%s' on '%s' is not a struct"), *PathParts[Index], *ContainerStruct->GetName());
        return false;
    }

    PropertyTarget->Modify();
    return SetPropertyFromJson(FinalProperty, ContainerPtr, Value, OutError);
}

void CollectAssignments(const TSharedPtr<FJsonObject>& WidgetDef, TArray<TPair<FString, TSharedPtr<FJsonValue>>>& OutAssignments)
{
    if (!WidgetDef.IsValid())
    {
        return;
    }

    const TSharedPtr<FJsonObject>* PropertiesObject = nullptr;
    if (WidgetDef->TryGetObjectField(TEXT("properties"), PropertiesObject) && PropertiesObject && PropertiesObject->IsValid())
    {
        for (const auto& Pair : (*PropertiesObject)->Values)
        {
            OutAssignments.Add(TPair<FString, TSharedPtr<FJsonValue>>(Pair.Key, Pair.Value));
        }
    }

    const TArray<TSharedPtr<FJsonValue>>* PropertiesArray = nullptr;
    if (WidgetDef->TryGetArrayField(TEXT("properties"), PropertiesArray) && PropertiesArray)
    {
        for (const TSharedPtr<FJsonValue>& PropertyValue : *PropertiesArray)
        {
            const TSharedPtr<FJsonObject>* PropertyObject = nullptr;
            if (!PropertyValue.IsValid() || !PropertyValue->TryGetObject(PropertyObject) || !PropertyObject || !PropertyObject->IsValid())
            {
                continue;
            }

            FString PropertyName;
            if (!(*PropertyObject)->TryGetStringField(TEXT("key"), PropertyName))
            {
                if (!(*PropertyObject)->TryGetStringField(TEXT("name"), PropertyName))
                {
                    (*PropertyObject)->TryGetStringField(TEXT("property"), PropertyName);
                }
            }

            const TSharedPtr<FJsonValue>* NestedValue = (*PropertyObject)->Values.Find(TEXT("value"));
            if (!PropertyName.IsEmpty() && NestedValue && NestedValue->IsValid())
            {
                OutAssignments.Add(TPair<FString, TSharedPtr<FJsonValue>>(PropertyName, *NestedValue));
            }
        }
    }

    const TSharedPtr<FJsonObject>* SlotObject = nullptr;
    if (WidgetDef->TryGetObjectField(TEXT("slot"), SlotObject) && SlotObject && SlotObject->IsValid())
    {
        for (const auto& Pair : (*SlotObject)->Values)
        {
            OutAssignments.Add(TPair<FString, TSharedPtr<FJsonValue>>(TEXT("Slot.") + Pair.Key, Pair.Value));
        }
    }

    bool bIsVariable = false;
    if (WidgetDef->TryGetBoolField(TEXT("is_variable"), bIsVariable))
    {
        OutAssignments.Add(TPair<FString, TSharedPtr<FJsonValue>>(TEXT("bIsVariable"), MakeShared<FJsonValueBoolean>(bIsVariable)));
    }
}

bool AttachWidgetToParent(UWidget* ParentWidget, UWidget* Widget, FString& OutError)
{
    if (!ParentWidget || !Widget)
    {
        OutError = TEXT("Invalid parent/child widget state");
        return false;
    }

    if (UPanelWidget* PanelWidget = Cast<UPanelWidget>(ParentWidget))
    {
        PanelWidget->AddChild(Widget);
        return true;
    }
    if (UContentWidget* ContentWidget = Cast<UContentWidget>(ParentWidget))
    {
        if (ContentWidget->GetContent())
        {
            OutError = FString::Printf(TEXT("Content widget '%s' already has content"), *ParentWidget->GetName());
            return false;
        }
        ContentWidget->SetContent(Widget);
        return true;
    }

    OutError = FString::Printf(TEXT("Parent widget '%s' is not a container"), *ParentWidget->GetName());
    return false;
}

bool AttachWidget(UWidgetBlueprint* WidgetBlueprint, UWidget* Widget, const FString& ParentName, FString& OutError)
{
    if (!WidgetBlueprint || !WidgetBlueprint->WidgetTree || !Widget)
    {
        OutError = TEXT("Invalid widget tree state");
        return false;
    }
    if (ParentName.IsEmpty())
    {
        if (!WidgetBlueprint->WidgetTree->RootWidget)
        {
            WidgetBlueprint->WidgetTree->RootWidget = Widget;
            return true;
        }

        OutError = FString::Printf(TEXT("Widget '%s' has no parent but a root widget already exists"), *Widget->GetName());
        return false;
    }

    UWidget* ParentWidget = FindWidgetLoose(WidgetBlueprint->WidgetTree, ParentName);
    if (!ParentWidget)
    {
        OutError = FString::Printf(TEXT("Could not find parent widget '%s'"), *ParentName);
        return false;
    }
    return AttachWidgetToParent(ParentWidget, Widget, OutError);
}

bool FinalizeWidgetBlueprint(UWidgetBlueprint* WidgetBlueprint, bool bStructuralChange, FString& OutError)
{
    if (!WidgetBlueprint)
    {
        OutError = TEXT("Invalid widget blueprint");
        return false;
    }

    if (bStructuralChange)
    {
        FBlueprintEditorUtils::MarkBlueprintAsStructurallyModified(WidgetBlueprint);
    }
    else
    {
        FBlueprintEditorUtils::MarkBlueprintAsModified(WidgetBlueprint);
    }
    WidgetBlueprint->GetPackage()->MarkPackageDirty();
    FKismetEditorUtilities::CompileBlueprint(WidgetBlueprint);

    if (!UEditorAssetLibrary::SaveLoadedAsset(WidgetBlueprint, false))
    {
        OutError = FString::Printf(TEXT("Failed to save widget blueprint '%s'"), *WidgetBlueprint->GetPathName());
        return false;
    }
    return true;
}

void CollectEditableProperties(UStruct* Struct, const FString& Prefix, TArray<TSharedPtr<FJsonValue>>& OutProperties, int32 Depth)
{
    if (!Struct || Depth > 2)
    {
        return;
    }
    for (TFieldIterator<FProperty> It(Struct); It; ++It)
    {
        FProperty* Property = *It;
        if (!Property || !Property->HasAnyPropertyFlags(CPF_Edit))
        {
            continue;
        }

        const FString PropertyName = Prefix + Property->GetName();
        TSharedPtr<FJsonObject> PropertyInfo = MakeShared<FJsonObject>();
        PropertyInfo->SetStringField(TEXT("name"), PropertyName);
        PropertyInfo->SetStringField(TEXT("type"), Property->GetCPPType());
        OutProperties.Add(MakeShared<FJsonValueObject>(PropertyInfo));

        if (FStructProperty* StructProperty = CastField<FStructProperty>(Property))
        {
            CollectEditableProperties(StructProperty->Struct, PropertyName + TEXT("."), OutProperties, Depth + 1);
        }
    }
}
}

FEpicUnrealMCPWidgetCommands::FEpicUnrealMCPWidgetCommands()
{
}

TSharedPtr<FJsonObject> FEpicUnrealMCPWidgetCommands::HandleCommand(const FString& CommandType, const TSharedPtr<FJsonObject>& Params)
{
    if (CommandType == TEXT("add_widget_to_user_widget"))
    {
        return HandleAddWidgetToUserWidget(Params);
    }
    if (CommandType == TEXT("create_widget_from_layout"))
    {
        return HandleCreateWidgetFromLayout(Params);
    }
    if (CommandType == TEXT("edit_widget_property"))
    {
        return HandleEditWidgetProperty(Params);
    }
    if (CommandType == TEXT("get_batch_widget_properties"))
    {
        return HandleGetBatchWidgetProperties(Params);
    }

    return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Unknown widget command: %s"), *CommandType));
}

TSharedPtr<FJsonObject> FEpicUnrealMCPWidgetCommands::HandleAddWidgetToUserWidget(const TSharedPtr<FJsonObject>& Params)
{
    FString WidgetPath;
    if (!Params->TryGetStringField(TEXT("widget_path"), WidgetPath))
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'widget_path' parameter"));
    }

    FString WidgetType;
    if (!Params->TryGetStringField(TEXT("widget_type"), WidgetType))
    {
        if (!Params->TryGetStringField(TEXT("type"), WidgetType))
        {
            Params->TryGetStringField(TEXT("class"), WidgetType);
        }
    }
    FString WidgetName;
    if (!Params->TryGetStringField(TEXT("widget_name"), WidgetName))
    {
        Params->TryGetStringField(TEXT("name"), WidgetName);
    }
    FString ParentName;
    if (!Params->TryGetStringField(TEXT("parent_name"), ParentName))
    {
        Params->TryGetStringField(TEXT("parent"), ParentName);
    }

    if (WidgetType.IsEmpty() || WidgetName.IsEmpty())
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'widget_type' or 'widget_name' parameter"));
    }

    UWidgetBlueprint* WidgetBlueprint = LoadWidgetBlueprintAsset(WidgetPath);
    if (!WidgetBlueprint)
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Could not load widget blueprint '%s'"), *WidgetPath));
    }
    if (!WidgetBlueprint->WidgetTree)
    {
        WidgetBlueprint->WidgetTree = NewObject<UWidgetTree>(WidgetBlueprint, TEXT("WidgetTree"), RF_Transactional);
    }

    UClass* WidgetClass = ResolveClassByName(WidgetType);
    if (!WidgetClass || !WidgetClass->IsChildOf(UWidget::StaticClass()))
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Invalid widget class '%s'"), *WidgetType));
    }

    WidgetBlueprint->Modify();
    WidgetBlueprint->WidgetTree->Modify();

    const FName UniqueName = FBlueprintEditorUtils::FindUniqueKismetName(WidgetBlueprint, WidgetName);
    UWidget* NewWidget = WidgetBlueprint->WidgetTree->ConstructWidget<UWidget>(WidgetClass, UniqueName);
    if (!NewWidget)
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Failed to construct widget '%s'"), *WidgetName));
    }
    NewWidget->Modify();

    FString ErrorMessage;
    if (!AttachWidget(WidgetBlueprint, NewWidget, ParentName, ErrorMessage))
    {
        WidgetBlueprint->WidgetTree->RemoveWidget(NewWidget);
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(ErrorMessage);
    }

    TArray<TPair<FString, TSharedPtr<FJsonValue>>> Assignments;
    CollectAssignments(Params, Assignments);
    for (const TPair<FString, TSharedPtr<FJsonValue>>& Assignment : Assignments)
    {
        if (!ApplyWidgetProperty(NewWidget, Assignment.Key, Assignment.Value, ErrorMessage))
        {
            return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Failed to set property '%s' on '%s': %s"), *Assignment.Key, *UniqueName.ToString(), *ErrorMessage));
        }
    }

    if (!FinalizeWidgetBlueprint(WidgetBlueprint, true, ErrorMessage))
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(ErrorMessage);
    }

    TSharedPtr<FJsonObject> ResultObject = MakeShared<FJsonObject>();
    ResultObject->SetBoolField(TEXT("success"), true);
    ResultObject->SetStringField(TEXT("widget_path"), WidgetBlueprint->GetPathName());
    ResultObject->SetStringField(TEXT("widget_name"), UniqueName.ToString());
    ResultObject->SetStringField(TEXT("widget_type"), WidgetClass->GetName());
    return ResultObject;
}

TSharedPtr<FJsonObject> FEpicUnrealMCPWidgetCommands::HandleCreateWidgetFromLayout(const TSharedPtr<FJsonObject>& Params)
{
    FString WidgetPath;
    if (!Params->TryGetStringField(TEXT("widget_path"), WidgetPath))
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'widget_path' parameter"));
    }

    UWidgetBlueprint* WidgetBlueprint = LoadWidgetBlueprintAsset(WidgetPath);
    if (!WidgetBlueprint)
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Could not load widget blueprint '%s'"), *WidgetPath));
    }

    TArray<TSharedPtr<FJsonObject>> FlatLayout;
    const TArray<TSharedPtr<FJsonValue>>* LayoutArray = nullptr;
    if (Params->TryGetArrayField(TEXT("layout"), LayoutArray) && LayoutArray)
    {
        for (const TSharedPtr<FJsonValue>& WidgetValue : *LayoutArray)
        {
            const TSharedPtr<FJsonObject>* WidgetObject = nullptr;
            if (WidgetValue.IsValid() && WidgetValue->TryGetObject(WidgetObject) && WidgetObject)
            {
                FlattenWidgetLayout(*WidgetObject, TEXT(""), FlatLayout);
            }
        }
    }
    else
    {
        const TSharedPtr<FJsonObject>* LayoutObject = nullptr;
        if (Params->TryGetObjectField(TEXT("layout"), LayoutObject) && LayoutObject)
        {
            FlattenWidgetLayout(*LayoutObject, TEXT(""), FlatLayout);
        }
    }
    if (FlatLayout.Num() == 0)
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing or empty 'layout' parameter"));
    }

    bool bClearExisting = true;
    Params->TryGetBoolField(TEXT("clear_existing"), bClearExisting);

    WidgetBlueprint->Modify();
    if (!WidgetBlueprint->WidgetTree)
    {
        WidgetBlueprint->WidgetTree = NewObject<UWidgetTree>(WidgetBlueprint, TEXT("WidgetTree"), RF_Transactional);
    }
    WidgetBlueprint->WidgetTree->Modify();
    if (bClearExisting && WidgetBlueprint->WidgetTree->RootWidget)
    {
        WidgetBlueprint->WidgetTree->RemoveWidget(WidgetBlueprint->WidgetTree->RootWidget);
        WidgetBlueprint->WidgetTree->RootWidget = nullptr;
    }

    TMap<FString, UWidget*> CreatedWidgets;
    TArray<TSharedPtr<FJsonValue>> CreatedWidgetList;
    FString ErrorMessage;

    for (const TSharedPtr<FJsonObject>& WidgetDef : FlatLayout)
    {
        FString WidgetType;
        if (!WidgetDef->TryGetStringField(TEXT("widget_type"), WidgetType))
        {
            if (!WidgetDef->TryGetStringField(TEXT("type"), WidgetType))
            {
                WidgetDef->TryGetStringField(TEXT("class"), WidgetType);
            }
        }
        FString WidgetName;
        if (!WidgetDef->TryGetStringField(TEXT("widget_name"), WidgetName))
        {
            WidgetDef->TryGetStringField(TEXT("name"), WidgetName);
        }
        FString ParentName;
        if (!WidgetDef->TryGetStringField(TEXT("parent_name"), ParentName))
        {
            WidgetDef->TryGetStringField(TEXT("parent"), ParentName);
        }

        if (WidgetType.IsEmpty() || WidgetName.IsEmpty())
        {
            return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Each widget definition must include 'type' and 'name'"));
        }

        UClass* WidgetClass = ResolveClassByName(WidgetType);
        if (!WidgetClass || !WidgetClass->IsChildOf(UWidget::StaticClass()))
        {
            return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Invalid widget class '%s'"), *WidgetType));
        }

        const FName UniqueName = FBlueprintEditorUtils::FindUniqueKismetName(WidgetBlueprint, WidgetName);
        UWidget* NewWidget = WidgetBlueprint->WidgetTree->ConstructWidget<UWidget>(WidgetClass, UniqueName);
        if (!NewWidget)
        {
            return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Failed to construct widget '%s'"), *WidgetName));
        }
        NewWidget->Modify();

        UWidget* ExplicitParent = nullptr;
        if (!ParentName.IsEmpty())
        {
            if (UWidget** ExistingParent = CreatedWidgets.Find(ParentName))
            {
                ExplicitParent = *ExistingParent;
            }
        }

        const bool bAttached = ExplicitParent
            ? AttachWidgetToParent(ExplicitParent, NewWidget, ErrorMessage)
            : AttachWidget(WidgetBlueprint, NewWidget, ParentName, ErrorMessage);

        if (!bAttached)
        {
            WidgetBlueprint->WidgetTree->RemoveWidget(NewWidget);
            return FEpicUnrealMCPCommonUtils::CreateErrorResponse(ErrorMessage);
        }

        CreatedWidgets.Add(WidgetName, NewWidget);
        CreatedWidgets.Add(UniqueName.ToString(), NewWidget);

        TSharedPtr<FJsonObject> WidgetInfo = MakeShared<FJsonObject>();
        WidgetInfo->SetStringField(TEXT("requested_name"), WidgetName);
        WidgetInfo->SetStringField(TEXT("widget_name"), UniqueName.ToString());
        WidgetInfo->SetStringField(TEXT("widget_type"), WidgetClass->GetName());
        WidgetInfo->SetStringField(TEXT("parent_name"), ParentName);
        CreatedWidgetList.Add(MakeShared<FJsonValueObject>(WidgetInfo));
    }

    for (const TSharedPtr<FJsonObject>& WidgetDef : FlatLayout)
    {
        FString WidgetName;
        if (!WidgetDef->TryGetStringField(TEXT("widget_name"), WidgetName))
        {
            WidgetDef->TryGetStringField(TEXT("name"), WidgetName);
        }
        UWidget** WidgetPtr = CreatedWidgets.Find(WidgetName);
        if (!WidgetPtr || !*WidgetPtr)
        {
            return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Could not resolve created widget '%s'"), *WidgetName));
        }

        TArray<TPair<FString, TSharedPtr<FJsonValue>>> Assignments;
        CollectAssignments(WidgetDef, Assignments);
        for (const TPair<FString, TSharedPtr<FJsonValue>>& Assignment : Assignments)
        {
            if (!ApplyWidgetProperty(*WidgetPtr, Assignment.Key, Assignment.Value, ErrorMessage))
            {
                return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Failed to set property '%s' on '%s': %s"), *Assignment.Key, *WidgetName, *ErrorMessage));
            }
        }
    }

    if (!FinalizeWidgetBlueprint(WidgetBlueprint, true, ErrorMessage))
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(ErrorMessage);
    }

    TSharedPtr<FJsonObject> ResultObject = MakeShared<FJsonObject>();
    ResultObject->SetBoolField(TEXT("success"), true);
    ResultObject->SetStringField(TEXT("widget_path"), WidgetBlueprint->GetPathName());
    ResultObject->SetNumberField(TEXT("widget_count"), CreatedWidgetList.Num());
    ResultObject->SetArrayField(TEXT("created_widgets"), CreatedWidgetList);
    return ResultObject;
}

TSharedPtr<FJsonObject> FEpicUnrealMCPWidgetCommands::HandleEditWidgetProperty(const TSharedPtr<FJsonObject>& Params)
{
    FString WidgetPath;
    if (!Params->TryGetStringField(TEXT("widget_path"), WidgetPath))
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'widget_path' parameter"));
    }
    FString WidgetName;
    if (!Params->TryGetStringField(TEXT("widget_name"), WidgetName))
    {
        Params->TryGetStringField(TEXT("name"), WidgetName);
    }
    FString PropertyName;
    if (!Params->TryGetStringField(TEXT("property_name"), PropertyName))
    {
        Params->TryGetStringField(TEXT("property"), PropertyName);
    }
    const TSharedPtr<FJsonValue>* Value = Params->Values.Find(TEXT("value"));
    if (WidgetName.IsEmpty() || PropertyName.IsEmpty() || !Value || !Value->IsValid())
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'widget_name', 'property_name', or 'value' parameter"));
    }

    UWidgetBlueprint* WidgetBlueprint = LoadWidgetBlueprintAsset(WidgetPath);
    if (!WidgetBlueprint || !WidgetBlueprint->WidgetTree)
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Could not load widget blueprint '%s'"), *WidgetPath));
    }

    UWidget* Widget = FindWidgetLoose(WidgetBlueprint->WidgetTree, WidgetName);
    if (!Widget)
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Could not find widget '%s'"), *WidgetName));
    }

    FString ErrorMessage;
    if (!ApplyWidgetProperty(Widget, PropertyName, *Value, ErrorMessage))
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(FString::Printf(TEXT("Failed to set property '%s' on '%s': %s"), *PropertyName, *WidgetName, *ErrorMessage));
    }
    if (!FinalizeWidgetBlueprint(WidgetBlueprint, false, ErrorMessage))
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(ErrorMessage);
    }

    TSharedPtr<FJsonObject> ResultObject = MakeShared<FJsonObject>();
    ResultObject->SetBoolField(TEXT("success"), true);
    ResultObject->SetStringField(TEXT("widget_path"), WidgetBlueprint->GetPathName());
    ResultObject->SetStringField(TEXT("widget_name"), Widget->GetName());
    ResultObject->SetStringField(TEXT("property_name"), PropertyName);
    return ResultObject;
}

TSharedPtr<FJsonObject> FEpicUnrealMCPWidgetCommands::HandleGetBatchWidgetProperties(const TSharedPtr<FJsonObject>& Params)
{
    const TArray<TSharedPtr<FJsonValue>>* WidgetClasses = nullptr;
    if (!Params->TryGetArrayField(TEXT("widget_classes"), WidgetClasses) || !WidgetClasses)
    {
        return FEpicUnrealMCPCommonUtils::CreateErrorResponse(TEXT("Missing 'widget_classes' parameter"));
    }

    TSharedPtr<FJsonObject> PropertiesObject = MakeShared<FJsonObject>();
    for (const TSharedPtr<FJsonValue>& ClassValue : *WidgetClasses)
    {
        if (!ClassValue.IsValid() || ClassValue->Type != EJson::String)
        {
            continue;
        }

        const FString ClassName = ClassValue->AsString();
        UClass* Class = ResolveClassByName(ClassName);
        if (!Class)
        {
            continue;
        }

        TArray<TSharedPtr<FJsonValue>> Properties;
        CollectEditableProperties(Class, TEXT(""), Properties, 0);
        PropertiesObject->SetArrayField(ClassName, Properties);
    }

    TSharedPtr<FJsonObject> ResultObject = MakeShared<FJsonObject>();
    ResultObject->SetBoolField(TEXT("success"), true);
    ResultObject->SetObjectField(TEXT("properties"), PropertiesObject);
    return ResultObject;
}
