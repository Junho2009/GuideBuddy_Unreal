// Copyright 2022, Developed by Aamn Chahrour & Samrudh Sunil, Published by Inherited Tempest. All Rights Reserved.

using UnrealBuildTool;

public class TempestCombatFramework : ModuleRules
{
    public TempestCombatFramework(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = ModuleRules.PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicIncludePaths.AddRange(
            new string[] {
				// ... add public include paths required here ...
			}
            );

        PrivateIncludePaths.AddRange(
            new string[] {
				// ... add other private include paths required here ...
			}
            );

        PublicDependencyModuleNames.AddRange(
            new string[]
            {
                "Core",

				// ... add other public dependencies that you statically link with here ...
			}
            );

        PrivateDependencyModuleNames.AddRange(
            new string[]
            {
                "CoreUObject",
                "Engine",
                "Slate",
                "SlateCore",
                "GameplayTags",
                "EnhancedInput","InputCore","Niagara","AssetRegistry","AIModule","TempestCore","Projects","MotionWarping"
				// ... add private dependencies that you statically link with here ...
			}
            );

        if (Target.bBuildEditor)
        {
            PrivateDependencyModuleNames.AddRange(new string[] { "UnrealEd" });
        }

        DynamicallyLoadedModuleNames.AddRange(
            new string[]
            {
				// ... add any modules that your module loads dynamically here ...
			}
            );
    }
}