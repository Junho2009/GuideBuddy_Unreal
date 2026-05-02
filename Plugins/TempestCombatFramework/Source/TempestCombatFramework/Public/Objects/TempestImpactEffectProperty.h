// Fill out your copyright notice in the Description page of Project Settings.

#pragma once

#include "CoreMinimal.h"
#include "Objects/TempestBaseObject.h"
#include "TempestImpactEffectProperty.generated.h"

/**
 *
 */
USTRUCT(BlueprintType, meta = (DisplayName = "Instanced Impact Effect Properties"))
struct FInstancedImpactEffectProperties
{
    GENERATED_USTRUCT_BODY()

    UPROPERTY(BlueprintReadWrite, Instanced, EditAnywhere, Category = "Instanced Variables")
    class UTempestImpactEffectProperty* ImpactEffectProperty;

    FInstancedImpactEffectProperties() : ImpactEffectProperty(nullptr) {};
    ~FInstancedImpactEffectProperties() {};
};

UCLASS(Abstract, BlueprintType, Blueprintable, EditInlineNew)
class TEMPESTCOMBATFRAMEWORK_API UTempestImpactEffectProperty : public UTempestBaseObject
{
    GENERATED_BODY()
public:

    UTempestImpactEffectProperty();

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Initialization")
    FGameplayTag PropertyTag;

public:
    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Special Property Base Functions")
    void OnImpactEffectPropertyCreated();
    virtual void OnImpactEffectPropertyCreated_Implementation();

    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Special Property Base Functions")
    bool GetCanProcessImpactEffectProperty();
    virtual bool GetCanProcessImpactEffectProperty_Implementation();

    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Special Property Base Functions")
    void ProcessImpactEffectProperty();
    virtual void ProcessImpactEffectProperty_Implementation();
};
