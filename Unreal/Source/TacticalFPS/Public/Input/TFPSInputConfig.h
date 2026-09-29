#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "GameplayTagContainer.h"

#include "TFPSInputConfig.generated.h"

class UInputAction;

USTRUCT(BlueprintType)
struct FTFPSInputAction
{
	GENERATED_BODY()

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly)
	TObjectPtr<const UInputAction> InputAction = nullptr;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Meta = (Categories = "InputTag"))
	FGameplayTag InputTag;
};

/**
 * Maps Enhanced Input actions to InputTags. Native actions (move/look/jump/crouch) are bound straight to
 * character functions; ability actions are forwarded to the ASC by tag. Purely client-side data: it is
 * never replicated and the server never trusts it.
 */
UCLASS(BlueprintType, Const)
class TACTICALFPS_API UTFPSInputConfig : public UDataAsset
{
	GENERATED_BODY()

public:
	const UInputAction* FindNativeInputActionForTag(const FGameplayTag& InputTag) const;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Meta = (TitleProperty = "InputAction"))
	TArray<FTFPSInputAction> NativeInputActions;

	UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Meta = (TitleProperty = "InputAction"))
	TArray<FTFPSInputAction> AbilityInputActions;
};
