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
      World.ts            # состояние боя: узлы, дороги, потоки, юниты, золото, кулдауны
      tick.ts             # шаг симуляции (fixed timestep)
      commands.ts         # SendArmy (создаёт поток), Build, Upgrade, CastSpell
      stream.ts           # выпуск юнитов из узлов, отмена потока при атаке/повторном свайпе
      units.ts            # движение юнитов, полосы дорог (lanes), переходы между отрезками
      clash.ts            # касания юнитов разных сторон на дорогах (1:1)
      combat.ts           # приход юнита в узел: башня, 1:1 с защитником, захват; окно атаки
      economy.ts          # производство войск и золота
      capture.ts          # смена владельца, понижение постройки
      pathfinding.ts      # кратчайший путь по графу дорог (и порталам), узел-преграда
      preview.ts          # превью исхода атаки для UI
      bandits.ts          # набеги лагерей разбойников
      specials/           # боссы 10-х уровней: mage.ts, citadel.ts, dragon.ts (в резерве)
      victory.ts          # проверка победы/поражения
      clock.ts            # фиксированный шаг и скорость боя: ускорение, замедление на время выбора
    ai/
      EnemyAI.ts          # выдаёт commands на основе World и параметров уровня
    tutorial/
      tutorial.ts         # шаги обучения: условия, какие шаги замедляют бой (TUTORIAL.md)
      gate.ts             # блокировка на уроке: что разрешено сейчас, идёт ли урок (PLAYTEST-1 F-6)
    level/
      schema.ts           # тип LevelData + валидация
      loader.ts
      generator.ts        # генерация уровня по seed и параметрам (для черновиков)
    meta/
      Progress.ts         # открытые уровни, кристаллы, прокачки
      upgrades.ts         # постоянные бонусы, улучшения приёмов
      rewards.ts          # награды за победу/поражение
      stars.ts            # звёзды за уровень
      spellbook.ts        # открытые приёмы (выдаются по сюжету) и активный
      unlocks.ts          # какие постройки и экраны открыты (обучение)
      onboarding.ts       # тур «Прокачки» после уровня 6
      tips.ts             # совет на экране поражения
      settings.ts         # громкость (clampVolume) и язык (выбор игрока главнее платформы)
    map/
      decor.ts            # расстановка декора на карте глав (детерминированная, по seed главы)
    audio/
      playlist.ts         # какой трек/джингл где играет (ротация боевых, запасные варианты)
    save/
      SaveData.ts         # схема сохранения + версия + миграции (v10: громкости и язык в settings)
  dev/
    profiler.ts           # замер рендера боя (?profile, только dev-сервер; npm run profile, docs/PERF.md)
    perfFlags.ts          # ?perf=nostars,nofly,notip,nojingle,win,lose,pause — экран результата (PF-7), только dev
  platform/
    Platform.ts           # интерфейс: init, ready, gameplayStart/Stop,
                          #   showInterstitial, showRewarded, purchase,
                          #   getPurchases, consume, load, save, lang, vibrate
    YandexPlatform.ts     # реализация через ysdk
    MockPlatform.ts       # для dev: реклама = таймер, покупки = мгновенный успех
  scenes/
    BootScene.ts
    MenuScene.ts
    settings.ts           # применить и сохранить настройку в одном месте (setLang, settingsModel для панели)
    ChapterMapScene.ts
    BattleScene.ts        # рендер World + ввод
    BattleHUD.ts          # золото, кнопки приёмов, пауза
    ResultScene.ts        # победа/поражение, удвоение награды
    UpgradesScene.ts
    ShopScene.ts
  view/
    NodeView.ts           # отрисовка узла кодом (Graphics); тело и дуга вместимости запекаются в текстуры узла (docs/PERF.md PF-5, PF-3); показ через фильтр частоты (displayFilter.ts, PLAYTEST-1 F-2)
    UnitsView.ts          # все юниты одним батчем: пул изображений из одной запечённой текстуры
    RoadView.ts
    BuildMenu.ts          # меню построек; закрытые — тёмные с замком
    TutorialView.ts       # палец, подсветка, подсказка в бою
    introCard.ts          # карточка перед боем: лидер (выключена), злой маг (PLAYTEST-1 F-8)
    SettingsPanel.ts      # панель настроек (звук, музыка, громкость, язык): меню и пауза боя
    displayFilter.ts      # что показывает узел: число и цвет не чаще refreshMs (PLAYTEST-1 F-2)
    goldFill.ts           # заливка кнопки золотом по скруглённой грани (BUILD-BUTTON BB-5)
    roundedPolygon.ts     # многоугольник со скруглёнными углами: треугольник «Играть» в меню
    BakedLayer.ts         # неизменные Graphics (луг, дороги) запечены в одну текстуру через canvas 2D (docs/PERF.md PF-G)
    BakedGraphics.ts      # Graphics → текстура ×2 → Image (тело узла и дуга вместимости, docs/PERF.md PF-5, PF-3)
    Spotlight.ts          # затемнение с «дыркой» и палец для тура вне боя
    effects.ts            # твины, частицы, вспышки
    layout.ts             # адаптация под портрет/альбом
    audioContext.ts       # общий Web Audio контекст, разблокировка по первому тапу
    sound.ts              # эффекты: файл из SFX.files или синтез
    music.ts              # музыка (стрим через <audio>, кроссфейд) и джинглы
    MenuBanner.ts         # знамя-кнопка главного меню (колыхание, медальон, подписи)
    menuScreens.ts        # экраны главного меню: «Турнир» (портрет) и «Ночной замок» (альбом)
    ShinyTitle.ts         # заголовок на canvas-текстуре с бликом
    MapScenery.ts         # «живая» карта глав: дорога, декор, фишка, отряд, облака
    mapArt.ts             # картинки карты, запекаются в текстуры один раз
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

### Порядок тика (армии-потоки, GDD §3.6)
1. Команды (свайп создаёт `StreamState`, повторный свайп из того же узла отменяет старый поток).
2. Касания на дорогах (`clash.ts`) — **до** движения, с учётом пути за тик (swept): за тик встречные юниты сближаются на `2 × speed × dt` = 0.024 поля, это больше `contactDist`, поэтому проверка «пересекутся ли за тик», а не «стоят ли рядом».
3. Движение юнитов (`units.ts`). Дошедший до конца отрезка юнит либо переходит на следующий (через свой узел), либо приходит в цель → `combat.ts`: башня → 1:1 → захват; узлу ставится `attackedUntilMs = now + attackWindowMs`.
4. Выпуск (`stream.ts`): если источник атакован (`now < attackedUntilMs`) — все его потоки отменяются. Иначе работает **въезд на дорогу**: полоса (дорога + направление) открыта, если её хвостовой юнит отошёл от точки выхода (`lane.startP`) хотя бы на шаг `speed / releasePerSec`. Новый юнит ставится ровно на шаг позади хвоста (если полоса пуста или хвост далеко — в точку выхода), так шаг на дороге никогда не меньше эталонного, кто бы ни выпускал. Если на одну полосу претендуют несколько потоков узла, выходит тот, кто дольше не выпускал (`lastReleaseTick`) — по очереди. Не больше одного юнита на полосу за тик.
   Юнит ходит только по одной дороге: дошёл до конца полосы (`lane.endP`) — либо цель, либо свой промежуточный узел. Во втором случае он входит в гарнизон (`troops += 1`), а узел добавляет его в свой поток с тем же оставшимся маршрутом (`left += 1`) или создаёт такой поток. Если узел атакован — юнит просто остаётся в гарнизоне.
5. Экономика: производство стоит у атакованных узлов (и у источников, если `pauseSourceProduction`).
6. ИИ, особые механики, победа.

## Производительность
Цель — стабильные 60 FPS на слабом Android при **600 юнитах** на поле одновременно (стресс-уровень `dev_stress`: 20 узлов, все большие с казармами 3, все отправляют сразу). Правила для кода:

**Симуляция**
- Юниты — простые объекты в одном массиве `world.units`, удаление — swap-remove (O(1)), без `splice` и `filter` в тике. Id — растущее число, не строка.
- **Полосы дорог.** Для каждой дороги и направления — массив юнитов в порядке движения. Юниты одной скорости не обгоняют друг друга, поэтому полосу не нужно сортировать: вход в хвост, выход с головы. Полосы хранятся постоянно и обновляются при входе/выходе юнита, а не пересобираются каждый тик (`Map` в тике не создаём).
- Касания: для дороги идём двумя указателями навстречу по полосам `a→b` и `b→a`, пропуская юнитов той же стороны. Стоимость — O(юнитов на дороге), без перебора пар.
- Путь хранится один на поток и разделяется всеми его юнитами (ссылка на массив).
- В горячем цикле — никаких замыканий, `forEach`, деструктуризации с созданием объектов и строковых ключей вроде `` `${a}|${b}` ``: ключи дорог считаются один раз при загрузке уровня (индекс дороги — число).
- ИИ не перебирает юнитов при оценке каждой цели: «сколько врагов идёт в узел» поддерживается счётчиком `incoming[nodeId][owner]` (+1 при выходе юнита с целью, −1 при гибели/приходе).
- Превью свайпа считается по счётчикам, а не по юнитам.

**Рендер**
- Один `UnitsView` на все юниты: **Phaser `Blitter`** (есть в Phaser 4.2) с пулом `Bob` из **одной** текстуры-атласа с кружком-фигуркой каждой стороны, запечённой кодом (`generateTexture`, заново только при смене размера раскладки). Одна текстура → один draw call. Фигурки пула не создаются и не удаляются в бою: новая появляется, только когда на поле больше юнитов, чем было когда-либо; лишние паркуются за экраном (без `setVisible`, чтобы Blitter не пересобирал список отрисовки). Юниты рисуются **под узлами**: выходят и входят в узел из-под его края.
- **Никакого `Text` и `Graphics.clear()` на юнита.** Число узла перерисовывается только когда меняется `floor(troops)`.
- Позиции юнитов интерполируются между тиками без памяти о прошлом тике: скорость у всех одна, поэтому тик назад юнит был на `speed × dt` позади на своей дороге (у начала дороги — под узлом). Без твинов на юнита.
- Эффекты гибели: пул частиц с потолком (не больше ~40 одновременно); при массовом касании — одна вспышка на точку встречи не чаще раза в 100 мс. Звук касаний — не чаще раза в 80 мс.
- Колонна за пределами экрана не бывает (поле всегда в одном экране), поэтому отсечение не нужно.

**Проверка**
- `npm run bench` (Node, без рендера): 600 юнитов, 10 000 тиков; один тик — **≤ 0.5 мс** на настольном ПК. Не тест Vitest (время нестабильно), а отдельный скрипт с выводом цифр.
- Ручная проверка `dev_stress` в Chrome DevTools: CPU throttling ×6, Performance → нет кадров дольше 16.7 мс в бою; счётчик FPS (dev-флаг) держит 60.

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

// The rest of a route from one node: path[0] is the node a unit leaves, the last node is the target.
// Suffixes are built once per order (next = route from path[1]) and shared by its units and transit streams.
interface Route {
  path: string[];
  lanes: number[];               // lanes[i] = path[i] -> path[i + 1]; a unit walks only lanes[0]
  next: Route | null;
}

// Units waiting in a node to leave along a route (GDD 3.6): a swipe, transit forwarding or a raid.
interface StreamState {
  id: number;
  sourceId: string;
  owner: Owner;                  // 'neutral' for bandit raids
  route: Route;
  left: number;                  // units still to release (still counted in source troops)
  lastReleaseTick: number;       // for taking turns on a shared lane (-1: none yet)
  transit: boolean;              // forwarding: may leave the last troop (it was only passing)
  extra: boolean;                // citadel wave: on top of the garrison, a re-swipe does not cancel it
}

// One unit on a road. Plain object; its route is shared with its stream (not copied per unit).
interface UnitState {
  id: number;
  owner: Owner;
  route: Route;                  // walks route.lanes[0], then arrives at or goes into transit in route.path[1]
  progress: number;              // 0..1 along its road (between lane.startP and lane.endP)
}

// NodeState additions:
//   attackedUntilMs: number;     // battle time until which the node counts as attacked (any damage)
//   towerReadyAtMs: number;      // next tower shot (one shot may be held in reserve)
//   streams: number;             // active streams of the node (own order + transit forwarding)
// Lane: startP / endP — progress where units appear / arrive (STREAM.edgeDist of the end nodes).
// The renderer maps [startP, endP] to the visible part of the road between the drawn circles.

interface SideState {
  gold: number;
  spellCooldowns: Record<SpellId, number>;
  modifiers: SideModifiers;      // из мета-прокачки (игрок) или параметров уровня (враг); unitStrengthMult удалён
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
- приход юнита в узел: выстрел башни (темп, один выстрел в запасе), 1:1, крепость, захват, переход постройки к новому владельцу без изменений (F-3);
- отправка 75% (свайп; 50% — только внутренний режим ИИ `pull`), в узле остаётся хотя бы 1, запрет при 1 юните и из атакованного узла; маршрут только через свои узлы;
- поток: темп выхода, ровный шаг в колонне, число узла уменьшается по мере выхода, повторный свайп отменяет остаток, отмена при атаке без продолжения, обрыв при захвате источника;
- окно атаки: производство стоит у атакованного узла, у источника идёт (и стоит при `pauseSourceProduction`);
- касания на дорогах 1:1: встречные колонны, разная длина (остаток идёт дальше), одна сторона проходит насквозь, колонна у развилки возле узла, без пропуска касания на большом шаге тика;
- pathfinding;
- спецприёмы: стоимость, кулдаун, эффект;
- условия победы/поражения;
- награды и прокачки, миграции сохранений;
- smoke-тест: прогнать каждый уровень с ИИ против ИИ без рендера — бой должен завершиться за разумное число тиков.
