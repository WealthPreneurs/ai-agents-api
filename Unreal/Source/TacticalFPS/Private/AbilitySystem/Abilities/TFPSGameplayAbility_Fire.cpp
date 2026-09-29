#include "AbilitySystem/Abilities/TFPSGameplayAbility_Fire.h"

#include "AbilitySystem/TFPSShotTargetData.h"
#include "AbilitySystemComponent.h"
#include "AbilitySystemGlobals.h"
#include "Character/TFPSCharacter.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/Controller.h"
#include "GameFramework/GameStateBase.h"
#include "TFPSCollisionChannels.h"
#include "TFPSGameplayTags.h"
#include "TacticalFPS.h"
#include "TimerManager.h"
#include "Weapons/TFPSWeaponComponent.h"
#include "Weapons/TFPSWeaponDefinition.h"

UTFPSGameplayAbility_Fire::UTFPSGameplayAbility_Fire(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	FGameplayTagContainer AssetTags;
	AssetTags.AddTag(TFPSGameplayTags::Ability_Weapon_Fire);
	SetAssetTags(AssetTags);

	ActivationBlockedTags.AddTag(TFPSGameplayTags::State_Sprinting);
	ActivationBlockedTags.AddTag(TFPSGameplayTags::State_Reloading);

	FireCueTag = TFPSGameplayTags::GameplayCue_Weapon_Fire;
}

bool UTFPSGameplayAbility_Fire::CanActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayTagContainer* SourceTags, const FGameplayTagContainer* TargetTags, FGameplayTagContainer* OptionalRelevantTags) const
{
	if (!Super::CanActivateAbility(Handle, ActorInfo, SourceTags, TargetTags, OptionalRelevantTags))
	{
		return false;
	}

	// CurrentActorInfo is not set yet on a fresh activation, so resolve from the passed-in ActorInfo.
	const ATFPSCharacter* Character = ActorInfo ? Cast<ATFPSCharacter>(ActorInfo->AvatarActor.Get()) : nullptr;
	const UTFPSWeaponComponent* Weapons = Character ? Character->GetWeaponComponent() : nullptr;

	// The owning client checks predicted ammo, the server checks authoritative ammo. Predicted ammo is
	// never higher than the server's, so the server never rejects an activation for ammo the client
	// thought it had.
	return Weapons && Weapons->GetEquippedWeapon() && Weapons->GetAmmoInMagazine() > 0;
}

void UTFPSGameplayAbility_Fire::ActivateAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo, const FGameplayEventData* TriggerEventData)
{
	if (!CommitAbility(Handle, ActorInfo, ActivationInfo))
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	const UTFPSWeaponComponent* Weapons = GetWeaponComponentFromActorInfo();
	ActiveWeapon = Weapons ? Weapons->GetEquippedWeapon() : nullptr;
	if (!ActiveWeapon)
	{
		EndAbility(Handle, ActorInfo, ActivationInfo, true, true);
		return;
	}

	ShotsFiredThisActivation = 0;

	UAbilitySystemComponent* ASC = ActorInfo->AbilitySystemComponent.Get();
	const FPredictionKey ActivationKey = ActivationInfo.GetActivationPredictionKey();

	if (ActorInfo->IsNetAuthority() && !ActorInfo->IsLocallyControlled())
	{
		// Server copy of a remote player's ability: shots arrive as target data.
		TargetDataDelegateHandle = ASC->AbilityTargetDataSetDelegate(Handle, ActivationKey)
			.AddUObject(this, &ThisClass::OnServerTargetDataReceived);

		// Target data may have arrived before the activation RPC was processed.
		ASC->CallReplicatedTargetDataDelegatesIfSet(Handle, ActivationKey);
		return;
	}

	if (!ActorInfo->IsLocallyControlled())
	{
		return;
	}

	FireShot();

	const float Interval = ActiveWeapon->GetFireInterval();
	FTimerManager& Timers = GetWorld()->GetTimerManager();

	switch (ActiveWeapon->FireMode)
	{
	case ETFPSFireMode::SemiAuto:
		// Stay active for one interval so a semi-auto can't be clicked faster than its fire rate.
		Timers.SetTimer(FireTimerHandle, this, &ThisClass::K2_EndAbility, Interval, false);
		break;

	case ETFPSFireMode::Burst:
	case ETFPSFireMode::FullAuto:
		Timers.SetTimer(FireTimerHandle, this, &ThisClass::OnFireTimer, Interval, true);
		break;
	}
}

void UTFPSGameplayAbility_Fire::EndAbility(const FGameplayAbilitySpecHandle Handle, const FGameplayAbilityActorInfo* ActorInfo,
	const FGameplayAbilityActivationInfo ActivationInfo, bool bReplicateEndAbility, bool bWasCancelled)
{
	if (UWorld* World = GetWorld())
	{
		World->GetTimerManager().ClearTimer(FireTimerHandle);
	}

	if (TargetDataDelegateHandle.IsValid())
	{
		if (UAbilitySystemComponent* ASC = ActorInfo ? ActorInfo->AbilitySystemComponent.Get() : nullptr)
		{
			const FPredictionKey ActivationKey = ActivationInfo.GetActivationPredictionKey();
			ASC->AbilityTargetDataSetDelegate(Handle, ActivationKey).Remove(TargetDataDelegateHandle);
			ASC->ConsumeClientReplicatedTargetData(Handle, ActivationKey);
		}
		TargetDataDelegateHandle.Reset();
	}

	ActiveWeapon = nullptr;

	Super::EndAbility(Handle, ActorInfo, ActivationInfo, bReplicateEndAbility, bWasCancelled);
}

void UTFPSGameplayAbility_Fire::OnFireTimer()
{
	if (!IsActive())
	{
		return;
	}

	const UTFPSWeaponComponent* Weapons = GetWeaponComponentFromActorInfo();
	if (!Weapons || Weapons->GetEquippedWeapon() != ActiveWeapon)
	{
		K2_EndAbility(); // Weapon swapped mid-fire.
		return;
	}

	const bool bOutOfAmmo = Weapons->GetAmmoInMagazine() <= 0;

	if (ActiveWeapon->FireMode == ETFPSFireMode::FullAuto)
	{
		const FGameplayAbilitySpec* Spec = GetCurrentAbilitySpec();
		if (bOutOfAmmo || !Spec || !Spec->InputPressed)
		{
			K2_EndAbility();
			return;
		}

		FireShot();
		return;
	}

	// Burst: finish the burst regardless of input, then hold for the burst cooldown.
	if (bOutOfAmmo || ShotsFiredThisActivation >= ActiveWeapon->BurstCount)
	{
		FTimerManager& Timers = GetWorld()->GetTimerManager();
		Timers.ClearTimer(FireTimerHandle);

		if (ActiveWeapon->BurstCooldown > 0.f)
		{
			Timers.SetTimer(FireTimerHandle, this, &ThisClass::K2_EndAbility, ActiveWeapon->BurstCooldown, false);
		}
		else
		{
			K2_EndAbility();
		}
		return;
	}

	FireShot();
}

void UTFPSGameplayAbility_Fire::FireShot()
{
	ATFPSCharacter* Character = GetTFPSCharacterFromActorInfo();
	UTFPSWeaponComponent* Weapons = GetWeaponComponentFromActorInfo();
	UAbilitySystemComponent* ASC = CurrentActorInfo ? CurrentActorInfo->AbilitySystemComponent.Get() : nullptr;
	const AController* Controller = Character ? Character->GetController() : nullptr;

	if (!Character || !Weapons || !ASC || !Controller || !ActiveWeapon)
	{
		return;
	}

	if (Weapons->GetAmmoInMagazine() <= 0)
	{
		return;
	}

	// Each shot after the first runs outside the activation's prediction window, so it needs its own
	// key. The server opens a window with the same key when it handles the target data, which is what
	// lets the shooter's locally-played fire cue be skipped when the server multicasts it.
	// No-op on the server.
	FScopedPredictionWindow ScopedPrediction(ASC, true);

	FVector ViewLocation;
	FRotator ViewRotation;
	Controller->GetPlayerViewPoint(ViewLocation, ViewRotation);

	FTFPSShotTargetData* Shot = new FTFPSShotTargetData();
	Shot->Origin = ViewLocation;
	Shot->ShotSeq = Weapons->PredictShot();
	Shot->ClientServerTime = static_cast<float>(GetServerWorldTime());

	const bool bADS = ASC->HasMatchingGameplayTag(TFPSGameplayTags::State_ADS);
	const float SpreadHalfAngle = FMath::DegreesToRadians(bADS ? ActiveWeapon->ADSSpreadAngle : ActiveWeapon->HipSpreadAngle);
	const FVector AimDirection = ViewRotation.Vector();

	// Seeded by shot sequence so the server can reproduce the cone later if spread validation is added.
	FRandomStream SpreadStream(static_cast<int32>(Shot->ShotSeq));

	FCollisionQueryParams QueryParams(SCENE_QUERY_STAT(TFPSWeaponFire), /*bTraceComplex*/ false, Character);
	QueryParams.bReturnPhysicalMaterial = false;

	const int32 Pellets = FMath::Clamp(ActiveWeapon->PelletsPerShot, 1, FTFPSShotTargetData::MaxHits);
	for (int32 Pellet = 0; Pellet < Pellets; ++Pellet)
	{
		const FVector Direction = SpreadHalfAngle > 0.f ? SpreadStream.VRandCone(AimDirection, SpreadHalfAngle) : AimDirection;
		const FVector TraceEnd = ViewLocation + Direction * ActiveWeapon->MaxRange;

		FHitResult Hit;
		const bool bBlocked = GetWorld()->LineTraceSingleByChannel(Hit, ViewLocation, TraceEnd, TFPS_TraceChannel_Weapon, QueryParams);

		if (Pellet == 0)
		{
			Shot->EndPoint = bBlocked ? FVector(Hit.ImpactPoint) : TraceEnd;
			Shot->EndNormal = bBlocked ? FVector(Hit.ImpactNormal) : -Direction;
		}

		AActor* HitActor = bBlocked ? Hit.GetActor() : nullptr;
		if (HitActor && UAbilitySystemGlobals::GetAbilitySystemComponentFromActor(HitActor))
		{
			FTFPSShotHit& ShotHit = Shot->Hits.AddDefaulted_GetRef();
			ShotHit.HitActor = HitActor;
			ShotHit.ImpactPoint = Hit.ImpactPoint;
			ShotHit.BoneName = Hit.BoneName;
		}
	}

	++ShotsFiredThisActivation;

	// Predicted locally on a client; authoritative (and multicast) on a listen-server host.
	ExecuteFireCue(*Shot);
	K2_OnLocalShotFired();

	// The handle takes ownership of Shot.
	const FGameplayAbilityTargetDataHandle DataHandle(Shot);

	if (CurrentActorInfo->IsNetAuthority())
	{
		ProcessShotOnServer(*Shot);
	}
	else
	{
		ASC->CallServerSetReplicatedTargetData(
			CurrentSpecHandle,
			CurrentActivationInfo.GetActivationPredictionKey(),
			DataHandle,
			FGameplayTag(),
			ASC->ScopedPredictionKey);
	}
}

void UTFPSGameplayAbility_Fire::ExecuteFireCue(const FTFPSShotTargetData& Shot) const
{
	UAbilitySystemComponent* ASC = CurrentActorInfo ? CurrentActorInfo->AbilitySystemComponent.Get() : nullptr;
	if (!ASC || !FireCueTag.IsValid())
	{
		return;
	}

	FGameplayCueParameters Params;
	Params.Location = Shot.EndPoint;
	Params.Normal = Shot.EndNormal;
	Params.Instigator = CurrentActorInfo->OwnerActor;
	Params.EffectCauser = CurrentActorInfo->AvatarActor;
	Params.SourceObject = ActiveWeapon.Get();

	ASC->ExecuteGameplayCue(FireCueTag, Params);
}

void UTFPSGameplayAbility_Fire::OnServerTargetDataReceived(const FGameplayAbilityTargetDataHandle& Data, FGameplayTag ApplicationTag)
{
	UAbilitySystemComponent* ASC = CurrentActorInfo ? CurrentActorInfo->AbilitySystemComponent.Get() : nullptr;
	if (!ASC)
	{
		return;
	}

	// Copy before consuming: Data refers to the ASC's cached entry, which Consume clears.
	const FGameplayAbilityTargetDataHandle LocalData = Data;
	ASC->ConsumeClientReplicatedTargetData(CurrentSpecHandle, CurrentActivationInfo.GetActivationPredictionKey());

	// Exactly one shot per packet. Anything else is malformed or an attempt to multiply shots.
	const FGameplayAbilityTargetData* Raw = LocalData.Num() == 1 ? LocalData.Get(0) : nullptr;
	if (!Raw || Raw->GetScriptStruct() != FTFPSShotTargetData::StaticStruct())
	{
		UE_LOG(LogTFPS, Warning, TEXT("[%s] sent malformed shot data."), *GetNameSafe(GetAvatarActorFromActorInfo()));
		return;
	}

	ProcessShotOnServer(*static_cast<const FTFPSShotTargetData*>(Raw));
}

void UTFPSGameplayAbility_Fire::ProcessShotOnServer(const FTFPSShotTargetData& Shot)
{
	UTFPSWeaponComponent* Weapons = GetWeaponComponentFromActorInfo();
	if (!Weapons)
	{
		return;
	}

	const UTFPSWeaponDefinition* Weapon = Weapons->GetEquippedWeapon();

	if (!Weapon || Weapon != ActiveWeapon || !Weapons->ServerConsumeFireRateCredit() || !ValidateShot(Shot, *Weapon))
	{
		Weapons->ServerRejectShot(Shot.ShotSeq);
		return;
	}

	if (!Weapons->ServerConsumeAmmo(Shot.ShotSeq))
	{
		return;
	}

	// Remote shooter: multicast the cue under the client's prediction key (the shooter already played it).
	// Host shooter: FireShot already executed it authoritatively.
	if (!CurrentActorInfo->IsLocallyControlled())
	{
		ExecuteFireCue(Shot);
	}

	// Sum pellets per target so a shotgun blast is one GE application per victim, not one per pellet.
	TMap<AActor*, float, TInlineSetAllocator<4>> DamageByTarget;
	for (const FTFPSShotHit& Hit : Shot.Hits)
	{
		FName ValidatedBone;
		if (!ValidateHit(Shot, Hit, *Weapon, ValidatedBone))
		{
			continue;
		}

		const float Distance = FVector::Dist(Shot.Origin, Hit.ImpactPoint);
		DamageByTarget.FindOrAdd(Hit.HitActor.Get()) += Weapon->CalculateDamage(Distance, ValidatedBone);
	}

	for (const TPair<AActor*, float>& Entry : DamageByTarget)
	{
		ApplyDamage(Entry.Key, Entry.Value, *Weapon);
	}
}

bool UTFPSGameplayAbility_Fire::ValidateShot(const FTFPSShotTargetData& Shot, const UTFPSWeaponDefinition& Weapon) const
{
	const AActor* Shooter = GetAvatarActorFromActorInfo();
	if (!Shooter)
	{
		return false;
	}

	const APawn* ShooterPawn = Cast<APawn>(Shooter);
	const FVector ServerView = ShooterPawn ? ShooterPawn->GetPawnViewLocation() : Shooter->GetActorLocation();
	if (FVector::DistSquared(ServerView, Shot.Origin) > FMath::Square(MaxOriginError))
	{
		UE_LOG(LogTFPS, Warning, TEXT("[%s] shot rejected: origin %.0f cm from server view."),
			*GetNameSafe(Shooter), FVector::Dist(ServerView, Shot.Origin));
		return false;
	}

	const double Age = GetServerWorldTime() - Shot.ClientServerTime;
	if (Age < -MaxClockSkew || Age > MaxLagCompensationTime + MaxClockSkew)
	{
		UE_LOG(LogTFPS, Verbose, TEXT("[%s] shot rejected: age %.3f s outside compensation window."), *GetNameSafe(Shooter), Age);
		return false;
	}

	if (Shot.Hits.Num() > Weapon.PelletsPerShot)
	{
		UE_LOG(LogTFPS, Warning, TEXT("[%s] shot rejected: %d hits for %d pellets."), *GetNameSafe(Shooter), Shot.Hits.Num(), Weapon.PelletsPerShot);
		return false;
	}

	return FVector::DistSquared(Shot.Origin, Shot.EndPoint) <= FMath::Square(Weapon.MaxRange + 1.f);
}

bool UTFPSGameplayAbility_Fire::ValidateHit(const FTFPSShotTargetData& Shot, const FTFPSShotHit& Hit, const UTFPSWeaponDefinition& Weapon, FName& OutBone) const
{
	AActor* Target = Hit.HitActor.Get();
	const AActor* Shooter = GetAvatarActorFromActorInfo();
	if (!Target || Target == Shooter)
	{
		return false;
	}

	const ATFPSCharacter* TargetCharacter = Cast<ATFPSCharacter>(Target);
	if (TargetCharacter && TargetCharacter->IsDead())
	{
		return false;
	}

	if (!UAbilitySystemGlobals::GetAbilitySystemComponentFromActor(Target))
	{
		return false;
	}

	if (FVector::DistSquared(Shot.Origin, Hit.ImpactPoint) > FMath::Square(Weapon.MaxRange + 1.f))
	{
		return false;
	}

	// Plausibility until rewind exists: the impact must be near where the server has the target now,
	// widened by how far the target could have moved in the shot's claimed age.
	const float Age = FMath::Clamp(static_cast<float>(GetServerWorldTime() - Shot.ClientServerTime), 0.f, MaxLagCompensationTime);
	const float Slack = MaxTargetPositionError + Target->GetVelocity().Size() * Age;

	float Radius = 0.f;
	float HalfHeight = 0.f;
	Target->GetSimpleCollisionCylinder(Radius, HalfHeight);

	const FVector Delta = FVector(Hit.ImpactPoint) - Target->GetActorLocation();
	if (Delta.Size2D() > Radius + Slack || FMath::Abs(Delta.Z) > HalfHeight + Slack)
	{
		UE_LOG(LogTFPS, Warning, TEXT("[%s] hit on [%s] rejected: impact too far from target."), *GetNameSafe(Shooter), *GetNameSafe(Target));
		return false;
	}

	// Only static geometry: dynamic objects (doors, vehicles) may legitimately be elsewhere on the server
	// due to latency. Stop just short of the impact so the target's own surface doesn't count.
	const FVector ToImpact = FVector(Hit.ImpactPoint) - FVector(Shot.Origin);
	const FVector TraceEnd = FVector(Shot.Origin) + ToImpact.GetSafeNormal() * FMath::Max(ToImpact.Size() - 5.f, 0.f);

	FCollisionQueryParams QueryParams(SCENE_QUERY_STAT(TFPSHitValidation), false, Shooter);
	QueryParams.AddIgnoredActor(Target);

	if (GetWorld()->LineTraceTestByObjectType(Shot.Origin, TraceEnd, FCollisionObjectQueryParams(ECC_WorldStatic), QueryParams))
	{
		UE_LOG(LogTFPS, Warning, TEXT("[%s] hit on [%s] rejected: blocked by world geometry."), *GetNameSafe(Shooter), *GetNameSafe(Target));
		return false;
	}

	// A bone that doesn't exist on the target is a forged headshot claim: keep the hit, drop the multiplier.
	OutBone = NAME_None;
	if (Hit.BoneName != NAME_None && TargetCharacter && TargetCharacter->GetMesh()->GetBoneIndex(Hit.BoneName) != INDEX_NONE)
	{
		OutBone = Hit.BoneName;
	}

	return true;
}

void UTFPSGameplayAbility_Fire::ApplyDamage(AActor* Target, float Damage, const UTFPSWeaponDefinition& Weapon)
{
	UAbilitySystemComponent* SourceASC = CurrentActorInfo ? CurrentActorInfo->AbilitySystemComponent.Get() : nullptr;
	UAbilitySystemComponent* TargetASC = UAbilitySystemGlobals::GetAbilitySystemComponentFromActor(Target);
	if (!SourceASC || !TargetASC || !Weapon.DamageEffect || Damage <= 0.f)
	{
		return;
	}

	// Context carries instigator (PlayerState) and causer (character), which the health set uses for kill credit.
	const FGameplayEffectSpecHandle Spec = MakeOutgoingGameplayEffectSpec(Weapon.DamageEffect, GetAbilityLevel());
	if (!Spec.IsValid())
	{
		return;
	}

	Spec.Data->GetContext().AddSourceObject(&Weapon);
	Spec.Data->SetSetByCallerMagnitude(TFPSGameplayTags::SetByCaller_Damage, Damage);

	SourceASC->ApplyGameplayEffectSpecToTarget(*Spec.Data, TargetASC);
}

double UTFPSGameplayAbility_Fire::GetServerWorldTime() const
{
	const UWorld* World = GetWorld();
	const AGameStateBase* GameState = World ? World->GetGameState() : nullptr;
	return GameState ? GameState->GetServerWorldTimeSeconds() : (World ? World->GetTimeSeconds() : 0.0);
}
