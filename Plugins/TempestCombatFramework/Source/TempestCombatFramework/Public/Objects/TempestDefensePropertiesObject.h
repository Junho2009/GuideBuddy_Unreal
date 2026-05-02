// Copyright 2022, Developed by Aamn Chahrour & Samrudh Sunil, Published by Inherited Tempest. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Objects/TempestBaseObject.h"
#include "GameplayTagContainer.h"
#include "TempestDefensePropertiesObject.generated.h"

/**
 *
 */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnImpactPropertiesApplied, UTempestAttackPropertiesObject*, AttackProperty);

UCLASS()
class TEMPESTCOMBATFRAMEWORK_API UTempestDefensePropertiesObject : public UTempestBaseObject
{
    GENERATED_BODY()
public:

    UPROPERTY(BlueprintAssignable, BlueprintCallable, Category = "Base Dispatchers")
    FOnImpactPropertiesApplied OnImpactPropertiesApplied;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Defense Property Initialization")
    FGameplayTag DefensePropertyTag;

    UPROPERTY()
    AActor* DefensePropertyOwner;

    UPROPERTY(BlueprintReadOnly, Category = "Base Variables")
    FGameplayTag ImpactResult;

    UPROPERTY(BlueprintReadOnly, Category = "Base Variables")
    TArray<class UTempestBaseImpactEffect*> CreatedImpactEffects;

    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Base Functions")
    AActor* GetDefensePropertyOwner() { return DefensePropertyOwner; }

    UFUNCTION(BlueprintCallable, Category = "Base Functions")
    void SetDefensePropertyOwner(AActor* NewOwner) { DefensePropertyOwner = NewOwner; }

    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Base Functions")
    void ConstructDefenseProperty();
    virtual void ConstructDefenseProperty_Implementation();

    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Base Functions")
    void ProcessReceivedAttack();
    virtual void ProcessReceivedAttack_Implementation();

    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Getters")
    bool GetCanInfluenceAttribute(FGameplayTag AttributeToInfluence);
    virtual bool GetCanInfluenceAttribute_Implementation(FGameplayTag AttributeToInfluence);

    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Base Functions")
    float InfluenceAttributeAmount(FGameplayTag AttributeToInfluence, float AmountToInfluence);
    virtual float InfluenceAttributeAmount_Implementation(FGameplayTag AttributeToInfluence, float AmountToInfluence);

    UFUNCTION(BlueprintCallable, Category = "Base Functions")
    void SetImpactResult(FGameplayTag NewImpactResult) { ImpactResult = NewImpactResult; }

    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Base Functions")
    void ApplyHitEffectOfClass(TSubclassOf<class UTempestBaseImpactEffect> ImpactEffectClass);
    virtual void ApplyHitEffectOfClass_Implementation(TSubclassOf<class UTempestBaseImpactEffect> ImpactEffectClass);

    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, BlueprintPure, Category = "Base Functions")
    void GetHitEffectOfClass(TSubclassOf<class UTempestBaseImpactEffect> ImpactEffectClass, class UTempestBaseImpactEffect*& FoundImpactEffect);
    virtual void GetHitEffectOfClass_Implementation(TSubclassOf<class UTempestBaseImpactEffect> ImpactEffectClass, class UTempestBaseImpactEffect*& FoundImpactEffect);
};
