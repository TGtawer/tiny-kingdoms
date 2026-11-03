# Архитектура

## Принцип
**Детерминированная симуляция + тонкий слой рендера.**
`src/core` ничего не знает о Phaser, DOM и SDK. Phaser-сцены читают состояние симуляции и отправляют в неё команды. Это даёт тестируемость логики, простой ИИ (он работает через те же команды) и возможность прогонять уровни без рендера для проверки баланса.

## Структура

```
src/
  main.ts                 # точка входа: init платформы → запуск Phaser
  config/
    balance.ts            # ВСЕ числа баланса
    game.ts               # размеры, цвета, константы рендера
  core/                   # чистая логика, без Phaser
    sim/
      World.ts            # состояние боя: узлы, дороги, армии, золото, кулдауны
      tick.ts             # шаг симуляции (fixed timestep)
      commands.ts         # SendArmy, Build, Upgrade, CastSpell
      combat.ts           # бой при прибытии армии, башни
      economy.ts          # производство войск и золота
      capture.ts          # смена владельца, понижение постройки
      pathfinding.ts      # кратчайший путь по графу дорог
      victory.ts          # проверка победы/поражения
    ai/
      EnemyAI.ts          # выдаёт commands на основе World и параметров уровня
    level/
      schema.ts           # тип LevelData + валидация
      loader.ts
      generator.ts        # генерация уровня по seed и параметрам (для черновиков)
    meta/
      Progress.ts         # открытые уровни, кристаллы, прокачки
      upgrades.ts         # постоянные бонусы, улучшения приёмов
      rewards.ts          # награды за победу/поражение
    save/
      SaveData.ts         # схема сохранения + версия + миграции
  platform/
    Platform.ts           # интерфейс: init, ready, gameplayStart/Stop,
                          #   showInterstitial, showRewarded, purchase,
                          #   getPurchases, consume, load, save, lang
    YandexPlatform.ts     # реализация через ysdk
    MockPlatform.ts       # для dev: реклама = таймер, покупки = мгновенный успех
  scenes/
    BootScene.ts
    MenuScene.ts
    ChapterMapScene.ts
    BattleScene.ts        # рендер World + ввод
    BattleHUD.ts          # золото, кнопки приёмов, пауза
    ResultScene.ts        # победа/поражение, удвоение награды
    UpgradesScene.ts
    ShopScene.ts
  view/
    NodeView.ts           # отрисовка узла кодом (Graphics)
    ArmyView.ts           # отряд с числом
    RoadView.ts
    BuildMenu.ts
    effects.ts            # твины, частицы, вспышки
    layout.ts             # адаптация под портрет/альбом
  i18n/
    i18n.ts
    ru.json
    en.json
  levels/
    chapter01/level01.json ...
tests/
  core/...                # Vitest
```

## Симуляция
- Fixed timestep: 10 тиков/сек (`TICK_MS = 100`). Рендер интерполирует движение армий.
- `World` — простые сериализуемые объекты (без классов с методами внутри состояния), чтобы легко копировать и сравнивать в тестах.
- Ввод игрока и ИИ → очередь `Command` → применяется в начале тика. Невалидные команды (нет войск, не хватает золота, кулдаун) отклоняются функцией `validate`.
- Случайность — только через seeded RNG в `World`.
- Пауза: симуляция не тикает; при рекламе и скрытии вкладки — автоматическая пауза.

### Основные типы (ориентир)
```ts
type Owner = 'player' | 'enemy' | 'neutral';
type BuildingType = 'mine' | 'barracks' | 'tower';
type NodeSize = 'small' | 'medium' | 'large';

interface NodeState {
  id: string;
  x: number; y: number;          // в координатах уровня 0..1
  size: NodeSize;
  owner: Owner;
  troops: number;                // дробное значение внутри, показываем floor
  hasGoldVein: boolean;
  building: { type: BuildingType; level: 1 | 2 | 3 } | null;
}

interface ArmyState {
  id: string;
  owner: Exclude<Owner, 'neutral'>;
  count: number;
  path: string[];                // id узлов
  segment: number;               // текущий отрезок пути
  progress: number;              // 0..1 по отрезку
  targetId: string;
}

interface SideState {
  gold: number;
  spellCooldowns: Record<SpellId, number>;
  modifiers: SideModifiers;      // из мета-прокачки (игрок) или параметров уровня (враг)
}
```

## Уровни
```ts
interface LevelData {
  id: string;                    // "c01_l01"
  chapter: number; index: number;
  nodes: Array<Pick<NodeState,'id'|'x'|'y'|'size'|'owner'|'troops'|'hasGoldVein'|'building'>>;
  roads: Array<[string, string]>;
  enemy: { productionMult: number; aiThinkMs: number; aggression: number; startGold: number };
  playerStartGold: number;
  special?: { type: string; params: Record<string, unknown> }; // для 10-х уровней, TBD
  tutorial?: string;             // id сценария обучения
}
```
Координаты нормализованы (0..1), `layout.ts` раскладывает их под ориентацию экрана (в портрете поле можно поворачивать на 90°, если так узлы помещаются крупнее).

## Платформа
- `main.ts`: `await platform.init()` → загрузить сохранение → определить язык → запустить Phaser → после первой отрисовки меню `platform.ready()`.
- Обёртка над рекламой возвращает Promise с результатом (`'rewarded' | 'closed' | 'error'`), ставит игру и звук на паузу на время показа.
- Сохранения: `player.setData` (облако) + `localStorage` (запасной). При загрузке берём версию с большим `updatedAt`. Сохраняем после уровня, покупки, прокачки; не чаще раза в несколько секунд.
- Покупки: каталог id — `remove_ads`, `crystals_s`, `crystals_m`, `crystals_l`, `starter_pack`. Расходуемые покупки после выдачи — `consumePurchase`. `remove_ads` — постоянная, проверяется при каждом запуске.

## Тесты (Vitest)
Покрываем `src/core`:
- производство войск и золота, вместимость, влияние казарм;
- бой при прибытии, урон башни, захват, понижение/уничтожение постройки;
- отправка 75% (свайп) и 50% (тап), в узле остаётся хотя бы 1, запрет при 1 юните; маршрут только через свои узлы;
- столкновения армий на дорогах;
- pathfinding;
- спецприёмы: стоимость, кулдаун, эффект;
- условия победы/поражения;
- награды и прокачки, миграции сохранений;
- smoke-тест: прогнать каждый уровень с ИИ против ИИ без рендера — бой должен завершиться за разумное число тиков.
