#include "AbilitySystem/TFPSShotTargetData.h"

#include "Engine/PackageMapClient.h"

bool FTFPSShotHit::NetSerialize(FArchive& Ar, UPackageMap* Map, bool& bOutSuccess)
{
	UObject* Actor = HitActor.Get();
	Map->SerializeObject(Ar, AActor::StaticClass(), Actor);
	if (Ar.IsLoading())
	{
		HitActor = Cast<AActor>(Actor);
	}

	bool bPointOk = true;
	ImpactPoint.NetSerialize(Ar, Map, bPointOk);

	UPackageMap::StaticSerializeName(Ar, BoneName);

	bOutSuccess = bPointOk && !Ar.IsError();
	return true;
}

bool FTFPSShotTargetData::NetSerialize(FArchive& Ar, UPackageMap* Map, bool& bOutSuccess)
{
	bool bOk = true;
	bool bFieldOk = true;

	Origin.NetSerialize(Ar, Map, bFieldOk);
	bOk &= bFieldOk;
	EndPoint.NetSerialize(Ar, Map, bFieldOk);
	bOk &= bFieldOk;
	EndNormal.NetSerialize(Ar, Map, bFieldOk);
	bOk &= bFieldOk;

	Ar << ClientServerTime;
	Ar << ShotSeq;

	// Bounded: a malicious client cannot make the server allocate an arbitrarily large array.
	bOk &= SafeNetSerializeTArray_WithNetSerialize<MaxHits>(Ar, Hits, Map);

	bOutSuccess = bOk && !Ar.IsError();
	return true;
}
