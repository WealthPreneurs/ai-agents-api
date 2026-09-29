#include "Player/TFPSPlayerState.h"

#include "AbilitySystem/Attributes/TFPSHealthSet.h"
#include "AbilitySystem/TFPSAbilitySystemComponent.h"

ATFPSPlayerState::ATFPSPlayerState(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	AbilitySystemComponent = CreateDefaultSubobject<UTFPSAbilitySystemComponent>(TEXT("AbilitySystemComponent"));
	AbilitySystemComponent->SetIsReplicated(true);
	AbilitySystemComponent->SetReplicationMode(EGameplayEffectReplicationMode::Mixed);

	HealthSet = CreateDefaultSubobject<UTFPSHealthSet>(TEXT("HealthSet"));

	// PlayerState defaults to a very low update rate. The ASC replicates through its owner, so health,
	// tags and prediction acks would lag without raising this. Tune per game mode against the server's
	// tick rate; pair with Replication Graph / Iris prioritisation rather than raising it further.
	SetNetUpdateFrequency(100.f);
}

UAbilitySystemComponent* ATFPSPlayerState::GetAbilitySystemComponent() const
{
	return AbilitySystemComponent;
}
