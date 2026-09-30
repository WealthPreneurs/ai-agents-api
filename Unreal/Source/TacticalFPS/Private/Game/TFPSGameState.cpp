#include "Game/TFPSGameState.h"

#include "GameFramework/PlayerState.h"
#include "Net/Core/PushModel/PushModel.h"
#include "Net/UnrealNetwork.h"
#include "TFPSGameplayTags.h"

ATFPSGameState::ATFPSGameState(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
}

void ATFPSGameState::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const
{
	Super::GetLifetimeReplicatedProps(OutLifetimeProps);

	FDoRepLifetimeParams Params;
	Params.bIsPushBased = true;
	DOREPLIFETIME_WITH_PARAMS_FAST(ATFPSGameState, MatchPhase, Params);
	DOREPLIFETIME_WITH_PARAMS_FAST(ATFPSGameState, PhaseEndServerTime, Params);
	DOREPLIFETIME_WITH_PARAMS_FAST(ATFPSGameState, RoundNumber, Params);
	DOREPLIFETIME_WITH_PARAMS_FAST(ATFPSGameState, TeamScores, Params);
	DOREPLIFETIME_WITH_PARAMS_FAST(ATFPSGameState, TeamRoundWins, Params);
	DOREPLIFETIME_WITH_PARAMS_FAST(ATFPSGameState, WinningTeam, Params);
	DOREPLIFETIME_WITH_PARAMS_FAST(ATFPSGameState, bFriendlyFire, Params);
}

float ATFPSGameState::GetPhaseTimeRemaining() const
{
	if (PhaseEndServerTime <= 0.0)
	{
		return 0.f;
	}

	return static_cast<float>(FMath::Max(PhaseEndServerTime - GetServerWorldTimeSeconds(), 0.0));
}

bool ATFPSGameState::IsGameplayActive() const
{
	return IsMatchPhase(TFPSGameplayTags::Match_Phase_Warmup) || IsMatchPhase(TFPSGameplayTags::Match_Phase_InProgress);
}

void ATFPSGameState::InitTeams(int32 NumTeams, bool bInFriendlyFire)
{
	check(HasAuthority());

	TeamScores.Init(0, NumTeams);
	TeamRoundWins.Init(0, NumTeams);
	bFriendlyFire = bInFriendlyFire;
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSGameState, TeamScores, this);
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSGameState, TeamRoundWins, this);
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSGameState, bFriendlyFire, this);
}

void ATFPSGameState::SetMatchPhase(FGameplayTag NewPhase, float Duration)
{
	check(HasAuthority());

	MatchPhase = NewPhase;
	PhaseEndServerTime = Duration > 0.f ? GetServerWorldTimeSeconds() + Duration : 0.0;
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSGameState, MatchPhase, this);
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSGameState, PhaseEndServerTime, this);

	ForceNetUpdate();
	OnRep_MatchPhase(); // Server-side listeners (and the listen-server host's UI).
}

void ATFPSGameState::SetRoundNumber(int32 NewRoundNumber)
{
	check(HasAuthority());

	RoundNumber = NewRoundNumber;
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSGameState, RoundNumber, this);
}

void ATFPSGameState::AddTeamScore(uint8 TeamId, int32 Delta)
{
	check(HasAuthority());

	if (TeamScores.IsValidIndex(TeamId))
	{
		TeamScores[TeamId] += Delta;
		MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSGameState, TeamScores, this);
		OnRep_Scores();
	}
}

void ATFPSGameState::ResetTeamScores()
{
	check(HasAuthority());

	for (int32& Score : TeamScores)
	{
		Score = 0;
	}
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSGameState, TeamScores, this);
	OnRep_Scores();
}

void ATFPSGameState::ResetTeamRoundWins()
{
	check(HasAuthority());

	for (int32& Wins : TeamRoundWins)
	{
		Wins = 0;
	}
	WinningTeam = 255;
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSGameState, TeamRoundWins, this);
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSGameState, WinningTeam, this);
	OnRep_Scores();
}

void ATFPSGameState::AddTeamRoundWin(uint8 TeamId)
{
	check(HasAuthority());

	if (TeamRoundWins.IsValidIndex(TeamId))
	{
		++TeamRoundWins[TeamId];
		MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSGameState, TeamRoundWins, this);
		OnRep_Scores();
	}
}

void ATFPSGameState::SetWinningTeam(uint8 TeamId)
{
	check(HasAuthority());

	WinningTeam = TeamId;
	MARK_PROPERTY_DIRTY_FROM_NAME(ATFPSGameState, WinningTeam, this);
	OnRep_Scores();
}

void ATFPSGameState::MulticastKillFeed_Implementation(APlayerState* Killer, APlayerState* Victim)
{
	OnKillFeed.Broadcast(Killer, Victim);
}

void ATFPSGameState::OnRep_MatchPhase()
{
	OnMatchPhaseChanged.Broadcast(MatchPhase);
}

void ATFPSGameState::OnRep_Scores()
{
	OnScoresChanged.Broadcast();
}
