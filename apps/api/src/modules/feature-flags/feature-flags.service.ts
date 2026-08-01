import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureFlag } from '../../database/entities/feature-flag.entity';
import { Master } from '../../database/entities/master.entity';
import {
  FEATURES,
  ALL_FEATURE_KEYS,
  isKnownFeature,
  FeatureKey,
} from './feature-flags.registry';

export interface EffectiveFeatures {
  [key: string]: boolean;
}

@Injectable()
export class FeatureFlagsService {
  constructor(
    @InjectRepository(FeatureFlag)
    private flagRepo: Repository<FeatureFlag>,
    @InjectRepository(Master)
    private masterRepo: Repository<Master>,
  ) {}

  /** Мапа глобальних прапорців { key: enabled } для всіх відомих фіч. */
  async getGlobalMap(): Promise<Record<string, boolean>> {
    const rows = await this.flagRepo.find();
    const byKey = new Map(rows.map((r) => [r.key, r.enabled]));
    const map: Record<string, boolean> = {};
    for (const key of ALL_FEATURE_KEYS) {
      map[key] = byKey.get(key) ?? false;
    }
    return map;
  }

  /**
   * Ефективний набір фіч для конкретного майстра.
   * Правило: фіча увімкнена, якщо глобально ON, АБО персональний override === true.
   */
  computeEffective(
    globalMap: Record<string, boolean>,
    master: Pick<Master, 'featureFlags'>,
  ): EffectiveFeatures {
    const personal = master?.featureFlags ?? {};
    const result: EffectiveFeatures = {};
    for (const key of ALL_FEATURE_KEYS) {
      result[key] = globalMap[key] === true || personal[key] === true;
    }
    return result;
  }

  /** Зручний хелпер: одразу дістає глобальні прапорці й рахує ефективні. */
  async getEffectiveForMaster(
    master: Pick<Master, 'featureFlags'>,
  ): Promise<EffectiveFeatures> {
    const globalMap = await this.getGlobalMap();
    return this.computeEffective(globalMap, master);
  }

  /** Адмінка: перелік усіх фіч із глобальним станом. */
  async listAll() {
    const globalMap = await this.getGlobalMap();
    return FEATURES.map((f) => ({
      ...f,
      globalEnabled: globalMap[f.key] === true,
    }));
  }

  /** Адмінка: увімкнути/вимкнути фічу глобально. */
  async setGlobal(key: string, enabled: boolean): Promise<FeatureFlag> {
    if (!isKnownFeature(key)) {
      throw new BadRequestException(`Невідома фіча: ${key}`);
    }
    let flag = await this.flagRepo.findOne({ where: { key } });
    if (!flag) {
      const meta = FEATURES.find((f) => f.key === key);
      flag = this.flagRepo.create({
        key,
        enabled,
        description: meta?.description ?? null,
      });
    } else {
      flag.enabled = enabled;
    }
    return this.flagRepo.save(flag);
  }

  /** Адмінка: персональний override фічі для майстра (для бета-тесту). */
  async setMasterOverride(
    masterId: string,
    key: string,
    enabled: boolean,
  ): Promise<Record<string, boolean>> {
    if (!isKnownFeature(key)) {
      throw new BadRequestException(`Невідома фіча: ${key}`);
    }
    const master = await this.masterRepo.findOne({ where: { id: masterId } });
    if (!master) throw new NotFoundException('Майстра не знайдено');

    const flags: Record<string, boolean> = { ...(master.featureFlags ?? {}) };
    if (enabled) {
      flags[key] = true;
    } else {
      // Прибираємо ключ повністю замість false — чистіше зберігати лише активні.
      delete flags[key];
    }
    await this.masterRepo.update(masterId, { featureFlags: flags });
    return flags;
  }
}

export { FeatureKey };
