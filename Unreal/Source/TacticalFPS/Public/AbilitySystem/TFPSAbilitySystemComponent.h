#pragma once

#include "AbilitySystemComponent.h"
#include "CoreMinimal.h"

#include "TFPSAbilitySystemComponent.generated.h"

/**
 * Project ASC. Lives on ATFPSPlayerState so abilities, effects and attributes survive pawn death/respawn.
 *
 * Input routing: Enhanced Input actions are bound to InputTags. Abilities are granted with the matching
 * InputTag in their spec's dynamic source tags, so rebinding or swapping a weapon never touches C++ bindings.
 *
 * Runs on the owning client (predicted activation) and on the server (authoritative activation).
 * Simulated proxies never receive input.
 */
UCLASS()
class TACTICALFPS_API UTFPSAbilitySystemComponent : public UAbilitySystemComponent
{
	GENERATED_BODY()

public:
	UTFPSAbilitySystemComponent();

	/** Called by the local player controller when an input bound to InputTag is pressed. */
	void AbilityInputTagPressed(const FGameplayTag& InputTag);

	/** Called by the local player controller when an input bound to InputTag is released. */
	void AbilityInputTagReleased(const FGameplayTag& InputTag);

	/** Drains queued input once per frame. Call from APlayerController::PostProcessInput. */
	void ProcessAbilityInput(float DeltaTime, bool bGamePaused);

	/** Drops all queued/held input, e.g. on death, menu open or loss of focus. */
	void ClearAbilityInput();

protected:
	virtual void AbilitySpecInputPressed(FGameplayAbilitySpec& Spec) override;
	virtual void AbilitySpecInputReleased(FGameplayAbilitySpec& Spec) override;

private:
	// Handles are queued rather than activated inline so activation never mutates ActivatableAbilities
	// while the input stack is iterating, and so press+release in one frame still activates once.
	TArray<FGameplayAbilitySpecHandle> InputPressedSpecHandles;
	TArray<FGameplayAbilitySpecHandle> InputReleasedSpecHandles;
};
