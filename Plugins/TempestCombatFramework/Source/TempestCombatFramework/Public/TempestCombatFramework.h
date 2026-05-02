// Copyright 2022, Developed by Aamn Chahrour & Samrudh Sunil, Published by Inherited Tempest. All Rights Reserved. 

#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class FTempestCombatFrameworkModule : public IModuleInterface
{
public:

	/** IModuleInterface implementation */
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;
};
