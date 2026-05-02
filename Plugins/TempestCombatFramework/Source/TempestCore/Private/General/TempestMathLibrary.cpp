// Copyright 2024, Developed by Aamn Chahrour, Published by Inherited Tempest. All Rights Reserved.

#include "General/TempestMathLibrary.h"
#include "Kismet/KismetMathLibrary.h"
#include "GameFramework/Actor.h"
#include "Camera/CameraComponent.h"

float UTempestMathLibrary::GetDistanceBetweenActors(class AActor* From, class AActor* To)
{
    if (From && To)
    {
        return FVector::Dist(From->GetActorLocation(), To->GetActorLocation());
    }
    return 0.f;
}

FRotator UTempestMathLibrary::GetAnglesBetweenActors(class AActor* From, class AActor* To)
{
    FRotator LocalRotation(0.f, 0.f, 0.f);
    if (From && To)
    {
        FRotator LocalFromRotation = From->GetActorRotation();
        FRotator LocalToRotation = UKismetMathLibrary::FindLookAtRotation(From->GetActorLocation(), To->GetActorLocation());
        FRotator DeltaRotation = UKismetMathLibrary::NormalizedDeltaRotator(LocalFromRotation, LocalToRotation);
        LocalRotation = DeltaRotation;
    }
    return LocalRotation;
}

void UTempestMathLibrary::SortActorsByDistanceAndReferencePoint(TArray<class AActor*>& SortedActors, const TArray<class AActor*>& ArrayToSort, const FVector& ReferencePoint)
{
    // Copy the array to be sorted
    SortedActors = ArrayToSort;

    // Sort the copied array
    for (int32 i = 0; i < SortedActors.Num() - 1; ++i)
    {
        for (int32 j = 0; j < SortedActors.Num() - i - 1; ++j)
        {
            if (!CompareActorsByDistance(SortedActors[j], SortedActors[j + 1], ReferencePoint))
            {
                // Swap elements
                AActor* Temp = SortedActors[j];
                SortedActors[j] = SortedActors[j + 1];
                SortedActors[j + 1] = Temp;
            }
        }
    }
}

void UTempestMathLibrary::SortArrayByValue(TArray<float>& SortedArray, const TArray<float>& ArrayToSort)
{
    // Copy the array to be sorted
    SortedArray = ArrayToSort;

    // Sort the copied array
    SortedArray.Sort();
}

class AActor* UTempestMathLibrary::GetClosestActorToCameraCenter(class UCameraComponent* CameraComponent, const TArray<class AActor*>& Actors)
{
    if (!CameraComponent || Actors.Num() == 0)
    {
        return nullptr;
    }

    // Get the camera's forward vector and position
    FVector CameraForward = CameraComponent->GetForwardVector();
    FVector CameraLocation = CameraComponent->GetComponentLocation();

    // Track the closest actor and smallest angle
    AActor* ClosestActor = nullptr;
    float SmallestAngle = FLT_MAX;

    for (AActor* Actor : Actors)
    {
        if (Actor)
        {
            // Calculate the direction from the camera to the actor
            FVector DirectionToActor = (Actor->GetActorLocation() - CameraLocation).GetSafeNormal();
            float Angle = FMath::Acos(FVector::DotProduct(CameraForward, DirectionToActor));

            // Check if this angle is the smallest we've found
            if (Angle < SmallestAngle)
            {
                SmallestAngle = Angle;
                ClosestActor = Actor;
            }
        }
    }

    return ClosestActor;
}

float UTempestMathLibrary::GetCameraAngleToActor(class UCameraComponent* CameraComponent, const class AActor* InActor)
{
    if (!CameraComponent || !InActor)
    {
        return -1.f;
    }

    // Get the camera's forward vector and position
    FVector CameraForward = CameraComponent->GetForwardVector();
    FVector CameraLocation = CameraComponent->GetComponentLocation();

    // Calculate the direction from the camera to the actor
    FVector DirectionToActor = (InActor->GetActorLocation() - CameraLocation).GetSafeNormal();
    float Angle = FMath::Acos(FVector::DotProduct(CameraForward, DirectionToActor));

    return Angle;
}

bool UTempestMathLibrary::CompareActorsByDistance(const class AActor* A, const class AActor* B, const FVector& ReferencePoint)
{
    // Compare the squared distances of the actors from the reference point
    float DistA = (A && A->IsValidLowLevel()) ? (A->GetActorLocation() - ReferencePoint).SizeSquared() : FLT_MAX;
    float DistB = (B && B->IsValidLowLevel()) ? (B->GetActorLocation() - ReferencePoint).SizeSquared() : FLT_MAX;
    return DistA < DistB;
}