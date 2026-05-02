// Copyright 2024, Developed by Aamn Chahrour, Published by Inherited Tempest. All Rights Reserved.

#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "TempestMathLibrary.generated.h"

/**
 *
 */
UCLASS()
class TEMPESTCORE_API UTempestMathLibrary : public UBlueprintFunctionLibrary
{
    GENERATED_BODY()
public:
    // Function to calculate distance between two actors
    UFUNCTION(BlueprintCallable, Category = "Tempest Math Functions")
    static float GetDistanceBetweenActors(class AActor* From, class AActor* To);

    // Function to calculate Angle between two actors
    UFUNCTION(BlueprintCallable, Category = "Tempest Math Functions")
    static FRotator GetAnglesBetweenActors(class AActor* From, class AActor* To);

    UFUNCTION(BlueprintCallable, Category = "Tempest Math Functions")
    static void SortActorsByDistanceAndReferencePoint(TArray<class AActor*>& SortedActors, const TArray<class AActor*>& ArrayToSort, const FVector& ReferencePoint);

    UFUNCTION(BlueprintCallable, Category = "Tempest Math Functions")
    static void SortArrayByValue(TArray<float>& SortedArray, const TArray<float>& ArrayToSort);

    UFUNCTION(BlueprintCallable, Category = "Tempest Math Functions")
    static class AActor* GetClosestActorToCameraCenter(class UCameraComponent* CameraComponent, const TArray<class AActor*>& Actors);

    UFUNCTION(BlueprintCallable, Category = "Tempest Math Functions")
    static float GetCameraAngleToActor(class UCameraComponent* CameraComponent, const class AActor* InActor);

private:
    static bool CompareActorsByDistance(const class AActor* A, const class AActor* B, const FVector& ReferencePoint);
};
