#include "Game/TFPSGameMode.h"

#include "Character/TFPSCharacter.h"
#include "EngineUtils.h"
#include "Game/TFPSGameState.h"
#include "GameFramework/PlayerStart.h"
#include "Kismet/GameplayStatics.h"
#include "Player/TFPSPlayerController.h"
#include "Player/TFPSPlayerState.h"
#include "TFPSGameplayTags.h"
#include "TacticalFPS.h"
#include "TimerManager.h"

ATFPSGameMode::ATFPSGameMode(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	GameStateClass = ATFPSGameState::StaticClass();
	PlayerStateClass = ATFPSPlayerState::StaticClass();
	PlayerControllerClass = ATFPSPlayerController::StaticClass();
	DefaultPawnClass = ATFPSCharacter::StaticClass(); // Override with the character Blueprint.

	// Keep connections, PlayerStates (team) and controllers across maps; no reconnect hitch between matches.
	bUseSeamlessTravel = true;
}

void ATFPSGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);

	ScoreLimit = UGameplayStatics::GetIntOption(Options, TEXT("ScoreLimit"), ScoreLimit);
	RoundDuration = UGameplayStatics::GetIntOption(Options, TEXT("RoundDuration"), static_cast<int32>(RoundDuration));
	MinPlayersToStart = UGameplayStatics::GetIntOption(Options, TEXT("MinPlayers"), MinPlayersToStart);
	WarmupDuration = UGameplayStatics::GetIntOption(Options, TEXT("Warmup"), static_cast<int32>(WarmupDuration));
	MapRotationIndex = UGameplayStatics::GetIntOption(Options, TEXT("RotationIndex"), 0);

	NumTeams = FMath::Clamp(NumTeams, 2, 8);
	MinPlayersToStart = FMath::Max(MinPlayersToStart, 1);
	WarmupDuration = FMath::Max(WarmupDuration, 1.f);
}

void ATFPSGameMode::InitGameState()
{
	Super::InitGameState();

	GetTFPSGameState()->InitTeams(NumTeams, bFriendlyFire);
}

void ATFPSGameMode::StartPlay()
{
	Super::StartPlay();

	StartWarmup();
}

ATFPSGameState* ATFPSGameMode::GetTFPSGameState() const
{
	return GetGameState<ATFPSGameState>();
}

// --- Phase machine ------------------------------------------------------------------------------

void ATFPSGameMode::EnterPhase(FGameplayTag Phase, float Duration)
{
	UE_LOG(LogTFPS, Log, TEXT("Match phase -> %s (%.0f s)"), *Phase.ToString(), Duration);

	GetTFPSGameState()->SetMatchPhase(Phase, Duration);

	GetWorldTimerManager().ClearTimer(PhaseTimerHandle);
	if (Duration > 0.f)
	{
		GetWorldTimerManager().SetTimer(PhaseTimerHandle, this, &ThisClass::OnPhaseTimerExpired, Duration, false);
	}
}

void ATFPSGameMode::OnPhaseTimerExpired()
{
	const ATFPSGameState* GS = GetTFPSGameState();

	if (GS->IsMatchPhase(TFPSGameplayTags::Match_Phase_Warmup))
	{
		if (GetNumPlayers() >= MinPlayersToStart)
		{
			StartRound();
		}
		else
		{
			EnterPhase(TFPSGameplayTags::Match_Phase_Warmup, WarmupDuration);
		}
	}
	else if (GS->IsMatchPhase(TFPSGameplayTags::Match_Phase_InProgress))
	{
		EndRound(DetermineRoundWinner());
	}
	else if (GS->IsMatchPhase(TFPSGameplayTags::Match_Phase_RoundEnd))
	{
		if (IsMatchDecided())
		{
			StartPostGame();
		}
		else
		{
			StartRound();
		}
	}
	else if (GS->IsMatchPhase(TFPSGameplayTags::Match_Phase_PostGame))
	{
		TravelToNextMap();
	}
}

void ATFPSGameMode::StartWarmup()
{
	ATFPSGameState* GS = GetTFPSGameState();
	GS->SetRoundNumber(0);
	GS->ResetTeamScores();
	GS->ResetTeamRoundWins();

	EnterPhase(TFPSGameplayTags::Match_Phase_Warmup, WarmupDuration);
}

void ATFPSGameMode::StartRound()
{
	ATFPSGameState* GS = GetTFPSGameState();

	if (GS->GetRoundNumber() == 0)
	{
		// Leaving warmup: warmup stats don't count.
		for (APlayerState* PS : GS->PlayerArray)
		{
			if (ATFPSPlayerState* TFPSPS = Cast<ATFPSPlayerState>(PS))
			{
				TFPSPS->ResetMatchStats();
			}
		}
	}

	GS->SetRoundNumber(GS->GetRoundNumber() + 1);
	GS->ResetTeamScores();

	// Phase first so spawning rules see InProgress.
	EnterPhase(TFPSGameplayTags::Match_Phase_InProgress, RoundDuration);
	RestartAllPlayers();
}

void ATFPSGameMode::EndRound(uint8 WinningTeam)
{
	ATFPSGameState* GS = GetTFPSGameState();
	if (!GS->IsMatchPhase(TFPSGameplayTags::Match_Phase_InProgress))
	{
		return; // Already ended (e.g. score limit and timer in the same frame).
	}

	if (WinningTeam != ITFPSTeamAgentInterface::NoTeam)
	{
		GS->AddTeamRoundWin(WinningTeam);
	}
	GS->SetWinningTeam(WinningTeam);

	EnterPhase(TFPSGameplayTags::Match_Phase_RoundEnd, RoundEndDuration);
	FreezeAllPlayers();
}

void ATFPSGameMode::StartPostGame()
{
	GetTFPSGameState()->SetWinningTeam(DetermineMatchWinner());

	EnterPhase(TFPSGameplayTags::Match_Phase_PostGame, PostGameDuration);
	FreezeAllPlayers();
}

void ATFPSGameMode::TravelToNextMap()
{
	if (MapRotation.IsEmpty())
	{
		GetWorld()->ServerTravel(TEXT("?Restart"));
		return;
	}

	const int32 NextIndex = (MapRotationIndex + 1) % MapRotation.Num();
	const FString URL = FString::Printf(TEXT("%s?RotationIndex=%d"), *MapRotation[NextIndex], NextIndex);

	UE_LOG(LogTFPS, Log, TEXT("Travelling to %s"), *URL);
	GetWorld()->ServerTravel(URL);
}

bool ATFPSGameMode::CanPlayersSpawn() const
{
	const ATFPSGameState* GS = GetTFPSGameState();
	return GS && GS->IsGameplayActive();
}

bool ATFPSGameMode::IsMatchDecided() const
{
	const ATFPSGameState* GS = GetTFPSGameState();
	if (GS->GetRoundNumber() >= MaxRounds)
	{
		return true;
	}

	for (int32 Team = 0; Team < GS->GetNumTeams(); ++Team)
	{
		if (GS->GetTeamRoundWins(Team) >= RoundsToWin)
		{
			return true;
		}
	}
	return false;
}

uint8 ATFPSGameMode::DetermineRoundWinner() const
{
	const ATFPSGameState* GS = GetTFPSGameState();

	int32 BestScore = -1;
	uint8 Winner = ITFPSTeamAgentInterface::NoTeam;
	for (int32 Team = 0; Team < GS->GetNumTeams(); ++Team)
	{
		const int32 Score = GS->GetTeamScore(Team);
		if (Score > BestScore)
		{
			BestScore = Score;
			Winner = static_cast<uint8>(Team);
		}
		else if (Score == BestScore)
		{
			Winner = ITFPSTeamAgentInterface::NoTeam; // Tie.
		}
	}
	return Winner;
}

uint8 ATFPSGameMode::DetermineMatchWinner() const
{
	const ATFPSGameState* GS = GetTFPSGameState();

	int32 BestWins = -1;
	uint8 Winner = ITFPSTeamAgentInterface::NoTeam;
	for (int32 Team = 0; Team < GS->GetNumTeams(); ++Team)
	{
		const int32 Wins = GS->GetTeamRoundWins(Team);
		if (Wins > BestWins)
		{
			BestWins = Wins;
			Winner = static_cast<uint8>(Team);
		}
		else if (Wins == BestWins)
		{
			Winner = ITFPSTeamAgentInterface::NoTeam;
		}
	}
	return Winner;
}

// --- Players ------------------------------------------------------------------------------------

void ATFPSGameMode::HandleStartingNewPlayer_Implementation(APlayerController* NewPlayer)
{
	// Seamless travel and reconnects keep their team (CopyProperties / OverrideWith); only new joins pick one.
	if (ATFPSPlayerState* PS = NewPlayer->GetPlayerState<ATFPSPlayerState>())
	{
		if (PS->GetTFPSTeamId() == ITFPSTeamAgentInterface::NoTeam || PS->GetTFPSTeamId() >= NumTeams)
		{
			PS->SetTeamId(PickTeamForNewPlayer());
		}
	}

	// Spawns now if PlayerCanRestart allows; otherwise the player spectates until the next round.
	Super::HandleStartingNewPlayer_Implementation(NewPlayer);
}

uint8 ATFPSGameMode::PickTeamForNewPlayer() const
{
	TArray<int32, TInlineAllocator<8>> Counts;
	Counts.Init(0, NumTeams);

	for (const APlayerState* PS : GetTFPSGameState()->PlayerArray)
	{
		const uint8 Team = TFPSTeams::GetTeamId(PS);
		if (Counts.IsValidIndex(Team))
		{
			++Counts[Team];
		}
	}

	int32 Smallest = 0;
	for (int32 Team = 1; Team < Counts.Num(); ++Team)
	{
		if (Counts[Team] < Counts[Smallest])
		{
			Smallest = Team;
		}
	}
	return static_cast<uint8>(Smallest);
}

bool ATFPSGameMode::PlayerCanRestart_Implementation(APlayerController* Player)
{
	return CanPlayersSpawn() && Super::PlayerCanRestart_Implementation(Player);
}

bool ATFPSGameMode::ShouldSpawnAtStartSpot(AController* Player)
{
	// Always re-evaluate: the start used last life may now be next to an enemy.
	return false;
}

AActor* ATFPSGameMode::ChoosePlayerStart_Implementation(AController* Player)
{
	const uint8 Team = TFPSTeams::GetTeamId(Player ? Player->PlayerState : nullptr);
	const FName TeamTag(*FString::Printf(TEXT("Team%d"), Team));

	TArray<const ATFPSCharacter*, TInlineAllocator<64>> Living;
	for (TActorIterator<ATFPSCharacter> It(GetWorld()); It; ++It)
	{
		if (!It->IsDead())
		{
			Living.Add(*It);
		}
	}

	// Score = distance to the nearest living enemy (capped) + jitter. Starts tagged for another team
	// are skipped; untagged starts are shared. A later pass can add line-of-sight and
	// recent-death penalties.
	AActor* BestStart = nullptr;
	float BestScore = -1.f;

	for (TActorIterator<APlayerStart> It(GetWorld()); It; ++It)
	{
		APlayerStart* Start = *It;
		if (!Start->PlayerStartTag.IsNone() && Start->PlayerStartTag != TeamTag)
		{
			continue;
		}

		const FVector Location = Start->GetActorLocation();
		float NearestEnemy = SpawnSafeDistance;
		bool bBlocked = false;

		for (const ATFPSCharacter* Character : Living)
		{
			const float Distance = FVector::Dist(Location, Character->GetActorLocation());
			if (Distance < SpawnBlockRadius)
			{
				bBlocked = true;
				break;
			}

			if (!TFPSTeams::AreSameTeam(Character, Player ? Player->PlayerState : nullptr))
			{
				NearestEnemy = FMath::Min(NearestEnemy, Distance);
			}
		}

		if (bBlocked)
		{
			continue;
		}

		const float Score = NearestEnemy + FMath::FRandRange(0.f, SpawnRandomness);
		if (Score > BestScore)
		{
			BestScore = Score;
			BestStart = Start;
		}
	}

	return BestStart ? BestStart : Super::ChoosePlayerStart_Implementation(Player);
}

void ATFPSGameMode::FinishRestartPlayer(AController* NewPlayer, const FRotator& StartRotation)
{
	Super::FinishRestartPlayer(NewPlayer, StartRotation);

	if (ATFPSCharacter* Character = NewPlayer ? Cast<ATFPSCharacter>(NewPlayer->GetPawn()) : nullptr)
	{
		Character->OnDied.AddUniqueDynamic(this, &ThisClass::OnCharacterDied);
	}
}

void ATFPSGameMode::RestartAllPlayers()
{
	for (FConstPlayerControllerIterator It = GetWorld()->GetPlayerControllerIterator(); It; ++It)
	{
		APlayerController* PC = It->Get();
		if (!PC || !PC->PlayerState || PC->PlayerState->IsOnlyASpectator())
		{
			continue;
		}

		if (APawn* OldPawn = PC->GetPawn())
		{
			PC->UnPossess();
			OldPawn->Destroy();
		}

		RestartPlayer(PC);
	}
}

void ATFPSGameMode::FreezeAllPlayers()
{
	for (TActorIterator<ATFPSCharacter> It(GetWorld()); It; ++It)
	{
		It->SetMatchFrozen(true);
	}
}

void ATFPSGameMode::OnCharacterDied(ATFPSCharacter* Victim, AActor* Killer)
{
	ATFPSGameState* GS = GetTFPSGameState();
	ATFPSPlayerState* VictimPS = Victim ? Victim->GetPlayerState<ATFPSPlayerState>() : nullptr;

	// The damage context's instigator is the killer's PlayerState (the ASC owner); accept a pawn too.
	ATFPSPlayerState* KillerPS = Cast<ATFPSPlayerState>(Killer);
	if (!KillerPS)
	{
		if (const APawn* KillerPawn = Cast<APawn>(Killer))
		{
			KillerPS = KillerPawn->GetPlayerState<ATFPSPlayerState>();
		}
	}

	if (VictimPS)
	{
		VictimPS->AddDeath();
	}

	const bool bEnemyKill = KillerPS && KillerPS != VictimPS && !TFPSTeams::AreSameTeam(KillerPS, VictimPS);
	if (bEnemyKill)
	{
		KillerPS->AddKill();
	}

	GS->MulticastKillFeed(KillerPS, VictimPS);

	if (bEnemyKill && GS->IsMatchPhase(TFPSGameplayTags::Match_Phase_InProgress))
	{
		const uint8 KillerTeam = KillerPS->GetTFPSTeamId();
		GS->AddTeamScore(KillerTeam, 1);

		if (GS->GetTeamScore(KillerTeam) >= ScoreLimit)
		{
			EndRound(KillerTeam);
			return; // The next round respawns everyone.
		}
	}

	if (AController* VictimController = Victim ? Victim->GetController() : nullptr)
	{
		FTimerHandle RespawnHandle;
		GetWorldTimerManager().SetTimer(
			RespawnHandle,
			FTimerDelegate::CreateUObject(this, &ThisClass::RespawnPlayer, TWeakObjectPtr<AController>(VictimController)),
			FMath::Max(RespawnDelay, 0.01f),
			false);
	}
}

void ATFPSGameMode::RespawnPlayer(TWeakObjectPtr<AController> WeakController)
{
	AController* Controller = WeakController.Get();
	if (!Controller || !CanPlayersSpawn())
	{
		return;
	}

	if (APawn* CurrentPawn = Controller->GetPawn())
	{
		const ATFPSCharacter* Character = Cast<ATFPSCharacter>(CurrentPawn);
		if (Character && !Character->IsDead())
		{
			return; // Already respawned (e.g. a new round started during the delay).
		}

		// Leave the corpse behind; it expires via its own life span.
		Controller->UnPossess();
	}

	RestartPlayer(Controller);
}
