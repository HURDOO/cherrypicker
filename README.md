# Cherrypicker 🍒

Cherrypicker는 결제처와 금액에 맞는 신용카드 혜택을 비교하고, 카드 실적과 결제 기록을 관리하는 Next.js 애플리케이션입니다. 데이터는 서버의 SQLite 파일에 저장하며 Drizzle ORM으로 접근하고, 계정과 세션은 Better Auth가 관리합니다.

## 기술 구성

- Next.js 16 App Router, React 19, TypeScript
- Tailwind CSS 4, Zustand, dnd-kit
- SQLite, Drizzle ORM, better-sqlite3
- Better Auth 이메일/비밀번호 인증

브라우저는 SQLite 파일에 직접 접근하지 않습니다. 모든 데이터와 인증 처리는 Next.js의 Node.js 서버에서 수행됩니다.

## 로컬에서 시작하기

### 요구 사항

- 현재 지원 중인 Node.js LTS 버전(Node.js 22 이상 권장)
- npm

`better-sqlite3`는 네이티브 모듈입니다. 다른 운영체제나 CPU에서 만든 `node_modules`를 복사하지 말고 실행할 장치에서 의존성을 설치하세요.

### 설치

```bash
npm ci
cp .env.example .env
mkdir -p data backups
```

`npx auth@latest secret`을 실행해 나온 값을 `.env`의 `BETTER_AUTH_SECRET`에 넣습니다. 비밀키는 최소 32자의 고엔트로피 값이어야 하며 저장소에 커밋하면 안 됩니다.

기본 환경 변수는 다음과 같습니다.

```env
DATABASE_PATH=data/cherrypicker.db
BETTER_AUTH_SECRET=<generated-secret>
BETTER_AUTH_URL=http://localhost:3000
ALLOW_SIGN_UP=true
```

`DATABASE_PATH`의 상대 경로는 명령을 실행한 현재 디렉터리를 기준으로 합니다. 운영 환경에서는 절대 경로를 권장합니다. `BETTER_AUTH_URL`은 사용자가 실제로 접속하는 origin과 정확히 같아야 하며 운영 환경에서는 공개 HTTPS 주소를 사용합니다.
`ALLOW_SIGN_UP`은 정확히 `true`일 때만 가입을 엽니다. 공개 서버에서는 필요한 계정을 만든 뒤 `false`로 바꾸고 서버를 재시작해 신규 가입 API와 가입 화면을 닫으세요.

### 데이터베이스 준비와 실행

```bash
npm run dev
```

개발 서버는 시작 전에 migration과 seed를 자동 적용합니다. 현재 개발 명령은 macOS 파일 감시 한도에서 라우트가 누락되는 문제를 피하도록 Next.js의 webpack 개발 서버를 사용합니다. 별도로 데이터베이스만 준비하려면 `npm run db:setup`을 실행하세요. 브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다. seed 명령은 기본 카테고리, 브랜드, 카드와 혜택 규칙을 멱등적으로 추가·갱신하므로 초기 설치와 기본 데이터 변경 후 다시 실행할 수 있습니다. 안전을 위해 seed 원본에서 제거된 기존 시스템 행을 자동 삭제하지 않으며, 사용자 계정이나 결제 기록도 초기화하지 않습니다.

검증과 프로덕션 실행은 다음 명령을 사용합니다.

```bash
npm run lint
npm run build
npm run start
```

## 스키마 변경

Drizzle 스키마의 기준 파일은 `src/db/schema/`입니다. 스키마를 바꾼 뒤 SQL migration을 생성하고 로컬 DB에 적용합니다.

```bash
npm run db:generate -- --name=<change-name>
npm run db:migrate
```

생성된 `drizzle/` 디렉터리를 코드와 함께 커밋하세요. 운영 DB에는 `drizzle-kit push`를 사용하지 말고, 검토·커밋된 migration만 서버 시작 전에 적용합니다. Supabase의 기존 계정, 비밀번호, 결제 기록은 이 과정에서 자동으로 SQLite로 복사되지 않습니다. 필요한 경우 별도의 검증된 export/import 절차가 필요합니다.

저장소 루트의 `schema.sql`과 `migration_*.sql`은 전환 전 Supabase/PostgreSQL 구조를 보존한 레거시 참고 파일입니다. SQLite 운영에는 실행하지 않으며, 현재 기준 스키마와 migration은 각각 `src/db/schema/`와 `drizzle/`입니다.

## 안전한 온라인 백업

서버가 실행 중이어도 다음 명령으로 일관된 SQLite snapshot을 만들 수 있습니다.

```bash
# backups/cherrypicker-<timestamp>.db
npm run db:backup

# 원하는 파일 경로
npm run db:backup -- /mnt/external-backup/cherrypicker.db
```

스크립트는 `better-sqlite3`의 온라인 backup API를 사용하고, 임시 snapshot의 `PRAGMA quick_check`가 성공한 뒤 최종 파일명으로 옮깁니다. DB와 백업 파일은 mode `0600`으로 보호하며 기존 대상 파일은 덮어쓰지 않습니다. 실행 중인 WAL 데이터가 누락될 수 있으므로 애플리케이션이 켜진 상태에서 `.db` 파일만 `cp`하지 마세요.

`backups/`는 Git에서 제외됩니다. 같은 라즈베리파이의 같은 디스크만 백업 대상으로 삼지 말고, 별도 장치나 원격 저장소로 복제하고 정기적으로 복구를 시험하세요. 유지보수 명령이 `drizzle-kit`과 `tsx`를 사용하므로 서버에서 `devDependencies`를 제거하지 마세요.

## 라즈베리파이 배포

64비트 Raspberry Pi OS와 USB SSD를 권장합니다. 데이터베이스는 네트워크 파일시스템이나 microSD가 아니라 Pi에 직접 연결된 영속 디스크에 두세요. 64비트 OS와 지원 중인 Node.js LTS 조합에는 보통 사전 빌드된 `better-sqlite3` 바이너리가 설치됩니다. `npm ci`가 `node-gyp` 단계에서 실패한다면 Pi에 Python, `make`, C/C++ 컴파일러가 설치되어 있는지 확인하세요. 예:

```env
DATABASE_PATH=/srv/cherrypicker-data/cherrypicker.db
BETTER_AUTH_SECRET=<generated-secret>
BETTER_AUTH_URL=https://cards.example.com
ALLOW_SIGN_UP=false
```

최초 계정을 만들어야 한다면 reverse proxy로 공개하기 전에 LAN 또는 SSH 터널에서만 잠시 `ALLOW_SIGN_UP=true`로 실행하세요. 계정을 만든 즉시 `false`로 되돌리고 서버를 재시작한 뒤 공개하세요.

전용 서비스 계정이 DB와 backup 디렉터리를 소유해야 합니다. 아래는 애플리케이션 코드가 `/opt/cherrypicker`에 배치되어 있다고 가정한 최초 설정 예시입니다.

```bash
sudo useradd --system --home /opt/cherrypicker --shell /usr/sbin/nologin cherrypicker
sudo install -d -m 0750 -o cherrypicker -g cherrypicker /opt/cherrypicker
sudo install -d -m 0700 -o cherrypicker -g cherrypicker /srv/cherrypicker-data
sudo install -d -m 0700 -o cherrypicker -g cherrypicker /srv/cherrypicker-backups
sudo chown -R cherrypicker:cherrypicker /opt/cherrypicker

cd /opt/cherrypicker
sudo -u cherrypicker npm ci
sudo -u cherrypicker cp .env.example .env
sudo chmod 600 .env
# .env 값을 설정한 뒤 계속합니다.
sudo -u cherrypicker npm run db:setup
sudo -u cherrypicker npm run build
```

공개 서비스는 Next.js를 인터넷에 직접 노출하지 말고 Caddy나 nginx 같은 reverse proxy 뒤에 두어 HTTPS, 요청 크기 제한과 rate limiting을 처리하세요. 한 Pi에서는 앱 프로세스 하나만 실행하는 구성이 적합하며 PM2 cluster처럼 여러 인스턴스가 같은 SQLite 파일에 쓰는 구성은 피합니다.

systemd를 사용할 때의 기본 형태는 다음과 같습니다. 실제 저장소 경로와 `npm` 경로는 `pwd`, `command -v npm` 결과에 맞게 바꾸세요.

```ini
[Unit]
Description=Cherrypicker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=cherrypicker
Group=cherrypicker
WorkingDirectory=/opt/cherrypicker
Environment=NODE_ENV=production
EnvironmentFile=/opt/cherrypicker/.env
UMask=0077
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

같은 배포 디렉터리를 갱신할 때는 먼저 온라인 백업을 만든 뒤 서비스를 멈추고, 정지 상태에서 의존성 설치·빌드·migration·seed를 수행하세요. 실행 중인 `.next`나 `node_modules`를 교체하면 일시적인 500 또는 누락된 chunk가 발생할 수 있습니다. 무중단 배포가 필요해지면 별도 release 디렉터리에서 빌드한 뒤 symlink를 전환하는 방식을 사용하세요.

```bash
sudo -u cherrypicker npm run db:backup -- /srv/cherrypicker-backups/cherrypicker-YYYYMMDD-HHMMSS.db
sudo systemctl stop cherrypicker
sudo -u cherrypicker npm ci
sudo -u cherrypicker npm run lint
sudo -u cherrypicker npm run build
sudo -u cherrypicker npm run db:migrate
sudo -u cherrypicker npm run db:seed
sudo systemctl start cherrypicker
```

`.env`와 `BETTER_AUTH_SECRET`을 유지하세요. 비밀키를 임의로 교체하면 기존 로그인 세션에 영향을 줍니다.
