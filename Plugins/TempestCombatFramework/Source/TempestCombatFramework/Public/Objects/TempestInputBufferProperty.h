// Copyright 2024, Developed by Aamn Chahrour, Published by Inherited Tempest. All Rights Reserved. 

#pragma once

#include "CoreMinimal.h"
#include "Objects/TempestSpecialProperty.h"
#include "GameplayTagContainer.h"
#include "TempestInputBufferProperty.generated.h"

/**
 * 
 */

UCLASS(HideDropdown)
class TEMPESTCOMBATFRAMEWORK_API UTempestInputBufferProperty : public UTempestSpecialProperty
{
	GENERATED_BODY()

public:
	
private:
	UInputAction* InputToProcess;

public:
	UFUNCTION(BlueprintCallable, BlueprintPure,Category = "Input Handling")
	void GetInputToProcess(UInputAction*& InputAction){InputAction = InputToProcess;}

	UFUNCTION(BlueprintCallable, Category = "Input Handling")
	void SetInputToProcess(UInputAction* NewInputToProcess);


};