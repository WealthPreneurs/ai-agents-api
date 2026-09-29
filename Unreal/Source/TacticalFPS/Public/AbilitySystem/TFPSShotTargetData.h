#pragma once

#include "Abilities/GameplayAbilityTargetTypes.h"
#include "CoreMinimal.h"
#include "Engine/NetSerialization.h"

#include "TFPSShotTargetData.generated.h"

/** One pellet that the client says hit a damageable actor. */
USTRUCT()
struct FTFPSShotHit
{
	GENERATED_BODY()

	UPROPERTY()
	TWeakObjectPtr<AActor> HitActor;

	UPROPERTY()
	FVector_NetQuantize ImpactPoint;

	/** Physics body hit. A claim only: the server checks it exists and, after rewind, re-derives it. */
	UPROPERTY()
	FName BoneName;

	bool NetSerialize(FArchive& Ar, UPackageMap* Map, bool& bOutSuccess);
};

template <>
struct TStructOpsTypeTraits<FTFPSShotHit> : public TStructOpsTypeTraitsBase2<FTFPSShotHit>
{
	enum
	{
		WithNetSerializer = true
	};
};

/**
 * Everything the server needs to validate one trigger pull, sent client -> server as ability target data.
 * Custom-serialized to stay small: a single-pellet miss is ~20 bytes versus ~70+ for an FHitResult.
 */
USTRUCT()
struct TACTICALFPS_API FTFPSShotTargetData : public FGameplayAbilityTargetData
{
	GENERATED_BODY()

	/** Trace start (camera). Validated against the server's view of the shooter. */
	UPROPERTY()
	FVector_NetQuantize10 Origin;

	/** Where the first pellet stopped; drives tracers/impacts on other clients. */
	UPROPERTY()
	FVector_NetQuantize EndPoint;

	UPROPERTY()
	FVector_NetQuantizeNormal EndNormal;

	/** Damageable hits only. World impacts are cosmetic and never sent. */
	UPROPERTY()
	TArray<FTFPSShotHit> Hits;

	/** Client's estimate of server world time when it fired. Used by lag compensation to rewind. */
	UPROPERTY()
	float ClientServerTime = 0.f;

	/** Ammo prediction sequence number (see UTFPSWeaponComponent). */
	UPROPERTY()
	uint16 ShotSeq = 0;

	virtual UScriptStruct* GetScriptStruct() const override { return StaticStruct(); }
	virtual FString ToString() const override { return TEXT("FTFPSShotTargetData"); }

	bool NetSerialize(FArchive& Ar, UPackageMap* Map, bool& bOutSuccess);

	/** Upper bound on Hits; matches UTFPSWeaponDefinition::PelletsPerShot ClampMax. */
	static constexpr int32 MaxHits = 16;
};

template <>
struct TStructOpsTypeTraits<FTFPSShotTargetData> : public TStructOpsTypeTraitsBase2<FTFPSShotTargetData>
{
	enum
	{
		WithNetSerializer = true
	};
};
