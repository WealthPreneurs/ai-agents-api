#include "Player/TFPSPlayerController.h"

#include "AbilitySystem/TFPSAbilitySystemComponent.h"
#include "Player/TFPSPlayerState.h"

ATFPSPlayerState* ATFPSPlayerController::GetTFPSPlayerState() const
{
	return GetPlayerState<ATFPSPlayerState>();
}

UTFPSAbilitySystemComponent* ATFPSPlayerController::GetTFPSAbilitySystemComponent() const
{
	const ATFPSPlayerState* PS = GetTFPSPlayerState();
	return PS ? PS->GetTFPSAbilitySystemComponent() : nullptr;
}

void ATFPSPlayerController::PostProcessInput(const float DeltaTime, const bool bGamePaused)
{
	// Enhanced Input has dispatched this frame's bindings (which queued ability input on the ASC);
	// drain the queue once, before the pawn and movement tick, so activations are predicted this frame.
	if (UTFPSAbilitySystemComponent* ASC = GetTFPSAbilitySystemComponent())
	{
		ASC->ProcessAbilityInput(DeltaTime, bGamePaused);
	}

	Super::PostProcessInput(DeltaTime, bGamePaused);
}

void ATFPSPlayerController::OnUnPossess()
{
	// Don't carry held input (e.g. a held fire button) into the next pawn.
	if (UTFPSAbilitySystemComponent* ASC = GetTFPSAbilitySystemComponent())
	{
		ASC->ClearAbilityInput();
	}

	Super::OnUnPossess();
}
