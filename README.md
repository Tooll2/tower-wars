# ⚔️ Tower Wars (1v1 PvP Real-Time Strategy)

> Классическая браузерная PvP Tower Wars игра в реальном времени с авторитарным выделенным сервером и автоподбором игроков (Matchmaking).

- 🌐 **Основной игровой сервер**: [http://46.173.18.121:3000](http://46.173.18.121:3000)
- 🌐 **Зеркало клиента (GitHub Pages)**: [https://tooll2.github.io/tower-wars/](https://tooll2.github.io/tower-wars/)
- 💻 **Репозиторий**: [https://github.com/Tooll2/tower-wars](https://github.com/Tooll2/tower-wars)

---

## 🎮 Основные возможности

1. **Автоматический подбор игроков 1v1**: Нажмите **«🔍 НАЙТИ ИГРУ»** — сервер мгновенно соединит вас со свободным соперником без необходимости пересылать 4-значные коды.
2. **Защищенная архитектура (Authoritative Server Engine)**: Весь расчет урона, движение крипов, проверка проходимости путей и экономика считаются на Node.js сервере (30 FPS), исключая любые читы на клиенте.
3. **Мгновенный отклик (Client Prediction)**: Постройка башен происходит за 0 мс без задержек сети благодаря системе предсказания `pendingTowers`.
4. **Видимость крипов на поле соперника**: Вы видите в реальном времени, как ваши крипы идут по лабиринту соперника.
5. **12 тиров крипов и система Инкома**: Выплата дохода каждые 15 секунд.

---

## 🛠 Разработка и деплой на VPS

Полная спецификация для AI-агентов и разработчиков находится в файле [**`AGENTS.md`**](./AGENTS.md).

### Сквозной деплой на боевой VPS (`46.173.18.121:3000`):
```bash
# 1. Проверка синтаксиса
node -c balance.js; node -c pathfinding.js; node -c core.js; node -c server.js; node -c game.js

# 2. Пуш в репозиторий
git add .
git commit -m "Описание изменений"
git push origin master

# 3. Обновление и перезапуск на VPS
ssh -i "C:\Users\А\.ssh\hermes_beget" -o StrictHostKeyChecking=no root@46.173.18.121 "cd /opt/tower-wars && git pull origin master && systemctl restart tower-wars.service"

# 4. Проверка интеграционным тестом
node test_server_simulation.js
```
