#include "Player/TFPSPlayerState.h"

#include "AbilitySystem/Attributes/TFPSHealthSet.h"
#include "AbilitySystem/TFPSAbilitySystemComponent.h"
#include "Net/Core/PushModel/PushModel.h"
#include "Net/UnrealNetwork.h"

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

void ATFPSPlayerState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);

	FDoRepLifetimeParams Params;
	Params.bIsPushBased = true;
	DOREPLIFETIME_WITH_PARAMS_FAST(ATFPSPlayerState, TeamId, Params);
	DOREPLIFETIME_WITH_PARAMS_FAST(ATFPSPlayerState, Kills, Params);
	DOREPLIFETIME_WITH_PARAMS_FAST(ATFPSPlayerState, Deaths, Params);
}

UAbilitySystemComponent* ATFPSPlayerState::GetAbilitySystemComponent() const
{
	return AbilitySystemComponent;
}

void ATFPSPlayerState::SetTeamId(uint8 NewTeamId)
{
	check(HasAuthority());

	TeamId = NewTeamId;
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSPlayerState, TeamId, this);
}

void ATFPSPlayerState::AddKill()
{
	check(HasAuthority());

	++Kills;
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSPlayerState, Kills, this);
	SetScore(GetScore() + 100.f);
}

void ATFPSPlayerState::AddDeath()
{
	check(HasAuthority());

	++Deaths;
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSPlayerState, Deaths, this);
}

void ATFPSPlayerState::ResetMatchStats()
{
	check(HasAuthority());

	Kills = 0;
	Deaths = 0;
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSPlayerState, Kills, this);
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSPlayerState, Deaths, this);
	SetScore(0.f);
}

void ATFPSPlayerState::CopyProperties(APlayerState* PlayerState)
{
	Super::CopyProperties(PlayerState);

	// Seamless travel: keep the team (parties stay together); stats start fresh each map.
	if (ATFPSPlayerState* Next = Cast<ATFPSPlayerState>(PlayerState))
	{
		Next->SetTeamId(TeamId);
	}
}

void ATFPSPlayerState::OverrideWith(APlayerState* PlayerState)
{
	Super::OverrideWith(PlayerState);

	// Reconnect within the same map: restore team and stats from the inactive PlayerState.
	if (const ATFPSPlayerState* Old = Cast<ATFPSPlayerState>(PlayerState))
	{
		SetTeamId(Old->TeamId);
		Kills = Old->Kills;
		Deaths = Old->Deaths;
		MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSPlayerState, Kills, this);
		MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSPlayerState, Deaths, this);
	}
}
