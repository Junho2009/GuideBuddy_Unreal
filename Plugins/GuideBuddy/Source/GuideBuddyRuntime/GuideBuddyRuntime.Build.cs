using UnrealBuildTool;

public class GuideBuddyRuntime : ModuleRules
{
	public GuideBuddyRuntime(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(
			new string[]
			{
				"AIModule",
				"Core",
				"CoreUObject",
				"Engine",
				"EnhancedInput",
				"GameplayTags",
				"InputCore",
				"Json",
				"JsEnv",
				"Puerts",
				"TempestCombatFramework",
				"TempestCore"
			});
	}
}
