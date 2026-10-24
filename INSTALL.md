# 타일클럽 — public_html 내부 설치 버전

상위 폴더에 파일을 올릴 수 없는 웹호스팅을 위한 버전입니다. 기존에 안내한 public_html 외부 배치 방식 대신 아래 방식을 사용합니다.

## 바로 업로드

`tile-club-public-html.zip`을 풀면 index.php, api, assets, _private, .htaccess가 나옵니다. **이 내용을 전부 public_html 안에 그대로 업로드**합니다. public 또는 tile-club 폴더를 중간에 추가하지 않습니다.

```text
public_html/
├── index.php
├── .htaccess
├── assets/
├── api/
│   └── index.php
└── _private/
    ├── .htaccess
    ├── app/
    └── storage/
        └── rooms/
```

1. PHP를 8.1 이상으로 설정합니다.
2. 위 파일과 폴더를 public_html 안에 업로드합니다. 점으로 시작하는 .htaccess도 포함해야 합니다.
3. public_html/_private/storage/rooms에 PHP 쓰기 권한이 있어야 합니다. 권한 700, 필요한 환경에서는 그룹 쓰기를 허용하는 770을 사용합니다.
4. 사이트 주소로 접속합니다. `/public`을 주소에 덧붙이지 않습니다.
5. 컴퓨터 대전과 친구 방 생성·입장을 확인합니다.

공유 호스팅에서 PHP 실행 사용자와 FTP 사용자가 다르면 폴더 소유권·쓰기 권한을 호스팅 관리 화면에서 맞춰야 합니다.

## 저장 파일 보호

_private/.htaccess는 해당 폴더에 대한 웹 요청을 거절합니다. 추가로 방 정보와 백업·생성 요청 기록은 `.php` 확장자 및 즉시 종료하는 PHP 머리말을 붙인 JSON으로 저장합니다. PHP가 실행되는 서버에서는 저장 파일을 웹으로 직접 요청해도 내용이 출력되지 않습니다. 임시 저장 파일도 같은 PHP 확장자를 사용합니다.

게임 상태를 include/eval하지 않습니다. 보호 머리말을 검증한 뒤 문자열을 JSON으로 해석합니다. 단일 서버의 파일 잠금과 원자적 교체 방식은 유지합니다. 이 버전은 기존의 일반 `.json` 저장 파일을 자동으로 가져오지 않습니다. 이전 버전의 게임을 새 설치 중에 섞지 마세요.

## 업데이트

index.php, api, assets, _private/app 및 .htaccess를 함께 덮어쓰면 됩니다. **_private/storage/rooms 안에 생성된 파일은 삭제하지 마세요.** API는 _private/app의 공통 코드를 직접 사용하므로 이 폴더도 반드시 업로드해야 합니다.

이전 버전에서 이번 버전으로 업데이트할 때는 잠시 웹 요청을 중지하고 진행 중인 PHP 요청이 종료된 뒤 전체 코드를 교체하세요. 잠금 방식이 바뀌므로 두 버전의 요청이 동시에 실행되어서는 안 됩니다. 기존 방 데이터는 그대로 읽습니다. 이전 버전의 남은 잠금 파일은 요청 중지 상태에서 `php tools/cleanup.php --legacy-locks`로 정리할 수 있습니다. 일반 만료 데이터 정리는 `php tools/cleanup.php`이며, 운영 환경에서는 주기적으로 실행해도 됩니다. 새 잠금 파일은 고정 개수로 재사용합니다.

Apache에서는 AllowOverride가 .htaccess의 Options 및 접근 제어 지시문을 허용해야 합니다. Nginx 등 .htaccess를 지원하지 않는 서버에서는 서버 설정에서 `/_private/`, `/tests/`, `/tools/` 경로와 INSTALL 문서 접근 및 디렉터리 목록을 차단하세요. 배포 후 `/_private/app/Support.php` 요청이 403 또는 404인지 확인하세요.

## 기능

친구 2인·3인 온라인, 컴퓨터와 1:1 싱글, 조커, 조합 재배치, 되돌리기, 서버 검증, 재접속, 재경기. 컴퓨터는 기본 난이도이며 전체 게임판 재배열은 하지 않습니다.

## 개발용 소스 폴더

현재 폴더가 웹 루트입니다. 이 폴더에서 `php -S 127.0.0.1:8080 -t .`를 실행한 뒤 http://127.0.0.1:8080 에 접속하세요. PHP 내장 서버는 .htaccess를 적용하지 않으므로 로컬 개발 용도로만 사용하세요.

회귀 검증은 `php tests/server.php`, `node tests/client.cjs`로 실행합니다. 테스트는 임시 폴더를 사용하며 기존 방 데이터는 변경하지 않습니다.
