#include "Input/TFPSInputConfig.h"

#include "TacticalFPS.h"

const UInputAction* UTFPSInputConfig::FindNativeInputActionForTag(const FGameplayTag& InputTag) const
{
	for (const FTFPSInputAction& Action : NativeInputActions)
	{
		if (Action.InputAction && Action.InputTag == InputTag)
		{
			return Action.InputAction;
		}
	}

	UE_LOG(LogTFPS, Warning, TEXT("No native input action for [%s] in [%s]."), *InputTag.ToString(), *GetNameSafe(this));
	return nullptr;
}
