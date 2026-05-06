using UnrealBuildTool;
using System.Collections.Generic;

public class TCF_SampleEditorTarget : TargetRules
{
	public TCF_SampleEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V6;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.Add("TCF_Sample");
	}
}
