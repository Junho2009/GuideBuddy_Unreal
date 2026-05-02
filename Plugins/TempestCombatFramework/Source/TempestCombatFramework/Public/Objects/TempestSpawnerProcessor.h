// Fill out your copyright notice in the Description page of Project Settings.

#pragma once

#include "CoreMinimal.h"
#include "Objects/TempestBaseConditionObject.h"
#include "Objects/TempestBaseObject.h"
#include "TempestSpawnerProcessor.generated.h"

/**
 *
 */

USTRUCT(BlueprintType, meta = (DisplayName = "Instanced Spawner Processor"))
struct FInstancedSpawnerProcessor
{
    GENERATED_USTRUCT_BODY()

    UPROPERTY(BlueprintReadWrite, Instanced, EditAnywhere, Category = "Instanced Variables")
    class UTempestSpawnerProcessor* SpawnerProcessor;

    FInstancedSpawnerProcessor() : SpawnerProcessor(nullptr) {};
    ~FInstancedSpawnerProcessor() {};
};

USTRUCT(BlueprintType, meta = (DisplayName = "Instanced Processor Properties"))
struct FInstancedProcessorConditions
{
    GENERATED_USTRUCT_BODY()

    UPROPERTY(BlueprintReadOnly, Instanced, EditAnywhere, Category = "Instanced Variables")
    class UTempestBaseConditionObject* SpawnCondition;

    UPROPERTY(BlueprintReadOnly, Instanced, EditAnywhere, Category = "Instanced Variables")
    class UTempestBaseConditionObject* DestructionCondition;

    FInstancedProcessorConditions() : SpawnCondition(nullptr), DestructionCondition(nullptr) {};
    ~FInstancedProcessorConditions() {};
};

UCLASS(Abstract, BlueprintType, EditInlineNew)
class TEMPESTCOMBATFRAMEWORK_API UTempestSpawnerProcessor : public UTempestBaseObject
{
    GENERATED_BODY()
public:

    UTempestSpawnerProcessor();

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Spawner Initialization")
    FInstancedProcessorConditions ProcessorConditions;
protected:
    UPROPERTY(BlueprintReadOnly, Category = "Base Values")
    class ATempest_AI_Spawner* SpawnerRef;

public:
    UFUNCTION(BlueprintCallable, BlueprintPure, Category = "Processor Getters")
    class ATempest_AI_Spawner* GetSpawner() const;

    UFUNCTION(BlueprintCallable, Category = "Processor Base Functions")
    void ConstructProcessor();

    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Processor Base Functions")
    void ProcessProcessor();
    virtual void ProcessProcessor_Implementation();

    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Processor Base Functions")
    TArray<AActor*> GetActorsToHide();
    virtual TArray<AActor*> GetActorsToHide_Implementation();

    UFUNCTION(BlueprintCallable, Category = "Processor Base Functions")
    void StartLoadingAssets(TArray<TSoftClassPtr<AActor>> AssetsToLoad);

    UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "Processor Base Functions")
    void OnAssetsLoadComeplete();
    virtual void OnAssetsLoadComeplete_Implementation();
};
