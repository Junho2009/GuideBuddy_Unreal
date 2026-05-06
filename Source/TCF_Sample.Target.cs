using UnrealBuildTool;
using System.Collections.Generic;

public class TCF_SampleTarget : TargetRules
{
	public TCF_SampleTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V6;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.Add("TCF_Sample");
	}
}
