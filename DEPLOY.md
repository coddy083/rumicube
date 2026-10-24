# GitHub Actions FTP 자동 배포

`.github/workflows/deploy-ftp.yml`은 저장소 기본 브랜치에 푸시하면
`rumi00.iwinv.net`의 `public_html/`로 사이트를 업로드합니다.
GitHub Actions 탭에서 **Deploy to FTP → Run workflow**로 수동 실행할 수도 있습니다.
기본 브랜치 외의 브랜치와 태그에서는 배포하지 않습니다.

## 최초 설정

1. 이 프로젝트를 GitHub 저장소에 올립니다.
2. 저장소의 **Settings → Secrets and variables → Actions → New repository secret**에서
   `FTP_PASSWORD`를 만들고 FTP 비밀번호를 값으로 저장합니다.
3. 기본 브랜치에 푸시하고 **Actions → Deploy to FTP**에서 성공 여부를 확인합니다.

FTP 서버와 계정은 워크플로에 설정되어 있고, 비밀번호는 GitHub Secret에서만 읽습니다.
비밀번호를 파일이나 커밋에 작성하지 마세요.

## 업로드 범위

`index.php`, 루트 `.htaccess`, `api/`, `assets/`, `_private/app/`,
`_private/.htaccess`, `_private/index.php`만 업로드합니다.
문서, 테스트, 개발 도구, 로컬 게임 데이터는 업로드하지 않습니다.
`_private/storage/`는 동기화 대상에서 제외하여 서버의 게임 데이터를 보존합니다.
전체 초기화 옵션은 꺼져 있으며 배포는 순차 실행됩니다.

첫 설치에서는 PHP가 `_private/storage/rooms/`를 생성할 수 있도록
호스팅의 폴더 소유권과 쓰기 권한을 설정하세요. 자세한 내용은 INSTALL.md를 참고하세요.
FTP 로그인 시 이미 public_html 안에서 시작하는 계정이라면 워크플로의
`server-dir`를 `./`로 변경하세요.

FTP 업로드는 파일 단위로 진행되므로 배포 중에는 서로 다른 버전의 파일이
잠시 섞일 수 있습니다. 저장 형식이나 잠금 방식이 바뀌는 업데이트는
INSTALL.md의 요청 중지 절차를 함께 따르세요.

사용한 배포 액션의 설정: https://github.com/SamKirkland/FTP-Deploy-Action
