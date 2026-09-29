#include "LagCompensation/TFPSLagCompensationSubsystem.h"

#include "Components/SkeletalMeshComponent.h"
#include "Engine/World.h"
#include "HAL/IConsoleManager.h"
#include "PhysicsEngine/PhysicsAsset.h"
#include "PhysicsEngine/SkeletalBodySetup.h"
#include "TacticalFPS.h"

namespace TFPSLagComp
{
	static TAutoConsoleVariable<float> CVarHistorySeconds(
		TEXT("tfps.LagComp.HistorySeconds"), 0.5f,
		TEXT("Seconds of hitbox history kept per target. Must cover the fire ability's MaxLagCompensationTime. Applies to targets registered afterwards."));

	static TAutoConsoleVariable<float> CVarHitboxInflation(
		TEXT("tfps.LagComp.HitboxInflation"), 2.f,
		TEXT("cm added to every hitbox radius during confirmation, to absorb interpolation and quantisation error."));

	static TAutoConsoleVariable<float> CVarJitterWindow(
		TEXT("tfps.LagComp.JitterWindow"), 0.016f,
		TEXT("Seconds either side of the rewind time also tested, to absorb ping jitter. 0 disables."));

	// Buffer is sized for this rate; faster servers get proportionally less history (logged once).
	static constexpr float MaxExpectedTickRate = 128.f;
}

bool UTFPSLagCompensationSubsystem::DoesSupportWorldType(const EWorldType::Type WorldType) const
{
	return WorldType == EWorldType::Game || WorldType == EWorldType::PIE;
}

void UTFPSLagCompensationSubsystem::Deinitialize()
{
	Histories.Reset();
	Super::Deinitialize();
}

TStatId UTFPSLagCompensationSubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UTFPSLagCompensationSubsystem, STATGROUP_Tickables);
}

void UTFPSLagCompensationSubsystem::RegisterTarget(AActor* Target, USkeletalMeshComponent* Mesh)
{
	if (!Target || !Mesh || GetWorld()->GetNetMode() == NM_Client)
	{
		return;
	}

	const UPhysicsAsset* PhysicsAsset = Mesh->GetPhysicsAsset();
	if (!PhysicsAsset)
	{
		UE_LOG(LogTFPS, Warning, TEXT("Lag compensation: [%s] has no physics asset; hits on it fall back to plausibility checks."), *GetNameSafe(Target));
		return;
	}

	FHistory History;
	History.Mesh = Mesh;

	for (const USkeletalBodySetup* Body : PhysicsAsset->SkeletalBodySetups)
	{
		if (!Body)
		{
			continue;
		}

		const int32 BoneIndex = Mesh->GetBoneIndex(Body->BoneName);
		if (BoneIndex == INDEX_NONE)
		{
			continue;
		}

		for (const FKSphylElem& Capsule : Body->AggGeom.SphylElems)
		{
			FHitboxDef& Def = History.Hitboxes.AddDefaulted_GetRef();
			Def.BoneName = Body->BoneName;
			Def.BoneIndex = BoneIndex;
			Def.LocalTransform = Capsule.GetTransform();
			Def.Radius = Capsule.Radius;
			Def.HalfLength = Capsule.Length * 0.5f;
		}

		for (const FKSphereElem& Sphere : Body->AggGeom.SphereElems)
		{
			FHitboxDef& Def = History.Hitboxes.AddDefaulted_GetRef();
			Def.BoneName = Body->BoneName;
			Def.BoneIndex = BoneIndex;
			Def.LocalTransform = FTransform(Sphere.Center);
			Def.Radius = Sphere.Radius;
			Def.HalfLength = 0.f;
		}

		if (Body->AggGeom.BoxElems.Num() > 0 || Body->AggGeom.ConvexElems.Num() > 0)
		{
			UE_LOG(LogTFPS, Warning, TEXT("Lag compensation: body [%s] on [%s] uses boxes/convexes, which are ignored. Use capsules or spheres for hitboxes."),
				*Body->BoneName.ToString(), *GetNameSafe(PhysicsAsset));
		}
	}

	if (History.Hitboxes.IsEmpty())
	{
		UE_LOG(LogTFPS, Warning, TEXT("Lag compensation: no usable hitboxes on [%s]."), *GetNameSafe(Target));
		return;
	}

	for (const FHitboxDef& Def : History.Hitboxes)
	{
		History.MaxHitboxRadius = FMath::Max(History.MaxHitboxRadius, Def.Radius);
	}

	// Preallocate every frame once; recording then never allocates.
	const int32 Capacity = FMath::CeilToInt(TFPSLagComp::CVarHistorySeconds.GetValueOnGameThread() * TFPSLagComp::MaxExpectedTickRate) + 2;
	History.Frames.SetNum(Capacity);
	for (FFrame& Frame : History.Frames)
	{
		Frame.Points.SetNumZeroed(History.Hitboxes.Num() * 2);
	}

	Histories.Add(Target, MoveTemp(History));
}

void UTFPSLagCompensationSubsystem::UnregisterTarget(AActor* Target)
{
	Histories.Remove(Target);
}

void UTFPSLagCompensationSubsystem::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);

	if (GetWorld()->GetNetMode() == NM_Client)
	{
		return;
	}

	// Tickable objects run after the world's tick groups, so animation and movement for this frame are final.
	const double Now = GetWorld()->GetTimeSeconds();
	for (auto It = Histories.CreateIterator(); It; ++It)
	{
		if (!It.Key().ResolveObjectPtr() || !It.Value().Mesh.IsValid())
		{
			It.RemoveCurrent();
			continue;
		}

		RecordFrame(It.Value(), Now);
	}
}

void UTFPSLagCompensationSubsystem::RecordFrame(FHistory& History, double Now) const
{
	const USkeletalMeshComponent* Mesh = History.Mesh.Get();
	const int32 Slot = (History.Newest + 1) % History.Frames.Num();
	FFrame& Frame = History.Frames[Slot];

	Frame.Time = Now;
	Frame.Scale = static_cast<float>(Mesh->GetComponentTransform().GetMaximumAxisScale());

	FBox3f Bounds(ForceInit);
	for (int32 Index = 0; Index < History.Hitboxes.Num(); ++Index)
	{
		const FHitboxDef& Def = History.Hitboxes[Index];
		const FTransform ShapeWorld = Def.LocalTransform * Mesh->GetBoneTransform(Def.BoneIndex);
		const FVector Center = ShapeWorld.GetLocation();
		const FVector HalfAxis = ShapeWorld.GetUnitAxis(EAxis::Z) * (Def.HalfLength * Frame.Scale);

		const FVector3f A(Center + HalfAxis);
		const FVector3f B(Center - HalfAxis);
		Frame.Points[Index * 2] = A;
		Frame.Points[Index * 2 + 1] = B;
		Bounds += A;
		Bounds += B;
	}

	Frame.BoundsCenter = Bounds.GetCenter();
	Frame.BoundsRadius = Bounds.GetExtent().Size() + History.MaxHitboxRadius * Frame.Scale;

	History.Newest = Slot;
	History.Count = FMath::Min(History.Count + 1, History.Frames.Num());
}

bool UTFPSLagCompensationSubsystem::SamplePose(const FHistory& History, double Time, FFrame& OutPose) const
{
	if (History.Count == 0)
	{
		return false;
	}

	const FFrame* Newer = &History.FromNewest(0);
	const FFrame* Older = nullptr;

	if (Time < Newer->Time)
	{
		for (int32 Age = 1; Age < History.Count; ++Age)
		{
			const FFrame& Candidate = History.FromNewest(Age);
			if (Candidate.Time <= Time)
			{
				Older = &Candidate;
				break;
			}
			Newer = &Candidate;
		}

		if (!Older)
		{
			static bool bWarned = false;
			if (!bWarned)
			{
				bWarned = true;
				UE_LOG(LogTFPS, Warning, TEXT("Lag compensation: rewind %.3f s past recorded history; clamping to the oldest frame. Raise tfps.LagComp.HistorySeconds."),
					History.FromNewest(0).Time - Time);
			}
		}
	}

	if (!Older)
	{
		// Newer than the newest frame, or older than the oldest: clamp to that frame.
		OutPose.Time = Newer->Time;
		OutPose.Scale = Newer->Scale;
		OutPose.BoundsCenter = Newer->BoundsCenter;
		OutPose.BoundsRadius = Newer->BoundsRadius;
		OutPose.Points = Newer->Points;
		return true;
	}

	const double Span = Newer->Time - Older->Time;
	const float Alpha = Span > UE_DOUBLE_SMALL_NUMBER ? static_cast<float>((Time - Older->Time) / Span) : 1.f;

	OutPose.Time = Time;
	OutPose.Scale = FMath::Lerp(Older->Scale, Newer->Scale, Alpha);
	OutPose.BoundsCenter = FMath::Lerp(Older->BoundsCenter, Newer->BoundsCenter, Alpha);
	OutPose.BoundsRadius = FMath::Max(Older->BoundsRadius, Newer->BoundsRadius);
	OutPose.Points.SetNumUninitialized(Newer->Points.Num());
	for (int32 Index = 0; Index < Newer->Points.Num(); ++Index)
	{
		OutPose.Points[Index] = FMath::Lerp(Older->Points[Index], Newer->Points[Index], Alpha);
	}

	return true;
}

bool UTFPSLagCompensationSubsystem::RayTestPose(const FHistory& History, const FFrame& Pose, const FVector& Origin,
	const FVector& Direction, float Length, FTFPSRewindHit& OutHit) const
{
	const float Inflation = TFPSLagComp::CVarHitboxInflation.GetValueOnGameThread();
	const FVector RayEnd = Origin + Direction * Length;

	// Cheap early-out against the whole body before testing individual hitboxes.
	if (FMath::PointDistToSegment(FVector(Pose.BoundsCenter), Origin, RayEnd) > Pose.BoundsRadius + Inflation)
	{
		return false;
	}

	float BestEntry = TNumericLimits<float>::Max();
	int32 BestIndex = INDEX_NONE;

	for (int32 Index = 0; Index < History.Hitboxes.Num(); ++Index)
	{
		const FVector A(Pose.Points[Index * 2]);
		const FVector B(Pose.Points[Index * 2 + 1]);

		// A capsule is every point within Radius of segment AB, so the ray hits it iff the ray segment
		// comes within Radius of AB.
		FVector OnRay;
		FVector OnCapsuleAxis;
		FMath::SegmentDistToSegmentSafe(Origin, RayEnd, A, B, OnRay, OnCapsuleAxis);

		const float Radius = History.Hitboxes[Index].Radius * Pose.Scale + Inflation;
		const float DistSq = static_cast<float>(FVector::DistSquared(OnRay, OnCapsuleAxis));
		if (DistSq > Radius * Radius)
		{
			continue;
		}

		// Approximate entry distance: back off from the closest point by the chord half-length.
		const float Entry = static_cast<float>(FVector::Dist(Origin, OnRay)) - FMath::Sqrt(Radius * Radius - DistSq);
		if (Entry < BestEntry)
		{
			BestEntry = Entry;
			BestIndex = Index;
		}
	}

	if (BestIndex == INDEX_NONE)
	{
		return false;
	}

	OutHit.BoneName = History.Hitboxes[BestIndex].BoneName;
	OutHit.Distance = FMath::Max(BestEntry, 0.f);
	OutHit.ImpactPoint = Origin + Direction * OutHit.Distance;
	return true;
}

ETFPSRewindResult UTFPSLagCompensationSubsystem::ConfirmHit(const AActor* Target, const FVector& RayOrigin, const FVector& RayDirection,
	float RayLength, double RewindTime, FTFPSRewindHit& OutHit) const
{
	const FHistory* History = Histories.Find(Target);
	if (!History || History->Count == 0)
	{
		return ETFPSRewindResult::NoHistory;
	}

	const FVector Direction = RayDirection.GetSafeNormal();
	const double Window = FMath::Max(TFPSLagComp::CVarJitterWindow.GetValueOnGameThread(), 0.f);

	// Centre first: if it hits, its bone is the most accurate answer.
	const double SampleTimes[] = { RewindTime, RewindTime - Window, RewindTime + Window };
	const int32 NumSamples = Window > 0.0 ? UE_ARRAY_COUNT(SampleTimes) : 1;

	for (int32 Sample = 0; Sample < NumSamples; ++Sample)
	{
		if (SamplePose(*History, SampleTimes[Sample], ScratchPose)
			&& RayTestPose(*History, ScratchPose, RayOrigin, Direction, RayLength, OutHit))
		{
			return ETFPSRewindResult::Hit;
		}
	}

	return ETFPSRewindResult::Miss;
}
