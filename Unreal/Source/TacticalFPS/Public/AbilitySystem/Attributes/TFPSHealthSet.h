#pragma once

#include "AbilitySystemComponent.h"
#include "AttributeSet.h"
#include "CoreMinimal.h"

#include "TFPSHealthSet.generated.h"

struct FGameplayEffectSpec;

#define TFPS_ATTRIBUTE_ACCESSORS(ClassName, PropertyName)           \
	GAMEPLAYATTRIBUTE_PROPERTY_GETTER(ClassName, PropertyName)      \
	GAMEPLAYATTRIBUTE_VALUE_GETTER(PropertyName)                    \
	GAMEPLAYATTRIBUTE_VALUE_SETTER(PropertyName)                    \
	GAMEPLAYATTRIBUTE_VALUE_INITTER(PropertyName)

/** Instigator, damage causer, the spec that caused the event, and the raw damage magnitude. */
DECLARE_MULTICAST_DELEGATE_FourParams(FTFPSAttributeEvent, AActor* /*Instigator*/, AActor* /*Causer*/, const FGameplayEffectSpec* /*Spec*/, float /*Magnitude*/);

/**
 * Health and armor. Damage never writes Health directly: damage effects add to the IncomingDamage
 * meta attribute, and PostGameplayEffectExecute (server only) resolves it into armor then health.
 * That keeps one choke point for damage rules, kill credit and anti-cheat checks.
 *
 * Replication:
 *  - Health/MaxHealth -> everyone (teammate UI, spectators, killcam).
 *  - Armor/MaxArmor   -> owner only. Enemies never learn armor state, which saves bandwidth and denies
 *                        ESP-style information to a modified client.
 *  - IncomingDamage   -> not replicated (server-side scratch value).
 */
UCLASS()
class TACTICALFPS_API UTFPSHealthSet : public UAttributeSet
{
	GENERATED_BODY()

public:
	UTFPSHealthSet();

	TFPS_ATTRIBUTE_ACCESSORS(UTFPSHealthSet, Health);
	TFPS_ATTRIBUTE_ACCESSORS(UTFPSHealthSet, MaxHealth);
	TFPS_ATTRIBUTE_ACCESSORS(UTFPSHealthSet, Armor);
	TFPS_ATTRIBUTE_ACCESSORS(UTFPSHealthSet, MaxArmor);
	TFPS_ATTRIBUTE_ACCESSORS(UTFPSHealthSet, IncomingDamage);

	/** Server only. Fired once when Health first reaches zero. */
	mutable FTFPSAttributeEvent OnOutOfHealth;

	virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& OutLifetimeProps) const override;

protected:
	virtual void PreAttributeBaseChange(const FGameplayAttribute& Attribute, float& NewValue) const override;
	virtual void PreAttributeChange(const FGameplayAttribute& Attribute, float& NewValue) override;
	virtual void PostAttributeChange(const FGameplayAttribute& Attribute, float OldValue, float NewValue) override;
	virtual bool PreGameplayEffectExecute(FGameplayEffectModCallbackData& Data) override;
	virtual void PostGameplayEffectExecute(const FGameplayEffectModCallbackData& Data) override;

	UFUNCTION()
	void OnRep_Health(const FGameplayAttributeData& OldValue);

	UFUNCTION()
	void OnRep_MaxHealth(const FGameplayAttributeData& OldValue);

	UFUNCTION()
	void OnRep_Armor(const FGameplayAttributeData& OldValue);

	UFUNCTION()
	void OnRep_MaxArmor(const FGameplayAttributeData& OldValue);

private:
	void ClampAttribute(const FGameplayAttribute& Attribute, float& NewValue) const;

	UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_Health, Category = "TFPS|Health", Meta = (AllowPrivateAccess = true))
	FGameplayAttributeData Health;

	UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_MaxHealth, Category = "TFPS|Health", Meta = (AllowPrivateAccess = true))
	FGameplayAttributeData MaxHealth;

	UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_Armor, Category = "TFPS|Health", Meta = (AllowPrivateAccess = true))
	FGameplayAttributeData Armor;

	UPROPERTY(BlueprintReadOnly, ReplicatedUsing = OnRep_MaxArmor, Category = "TFPS|Health", Meta = (AllowPrivateAccess = true))
	FGameplayAttributeData MaxArmor;

	/** Meta attribute: damage is staged here and consumed in PostGameplayEffectExecute. */
	UPROPERTY(BlueprintReadOnly, Category = "TFPS|Health", Meta = (AllowPrivateAccess = true))
	FGameplayAttributeData IncomingDamage;

	/** Guards against multiple death events from damage landing in the same frame. */
	bool bOutOfHealth = false;
};
