<?php
declare(strict_types=1);
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
?><!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#2456cc"><meta name="description" content="친구와 둘이, 셋이. 혼자라면 컴퓨터와 즐기는 숫자 타일 보드게임.">
<title>타일클럽 — 한 판 할까?</title>
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="assets/css/app.css?v=20261024-chat1">
<script type="module" src="assets/js/main.js?v=20261024-chat1"></script>
</head>
<body>
<a class="skip-link" href="#main">본문으로 이동</a>
<header class="topbar">
 <a class="brand" href="./" aria-label="타일클럽 시작 화면"><span class="brand-mark" aria-hidden="true">t<span>.</span></span><span>타일클럽<small>TILE CLUB</small></span></a>
 <div class="top-actions"><span id="connection" class="connection">연결 확인 중</span><button type="button" class="btn ghost" id="rules-button">게임 방법 <span aria-hidden="true">↗</span></button></div>
</header>
<main id="main" tabindex="-1"><div class="initial-loading">게임을 준비하고 있어요…</div></main>
<div id="notice" class="notice" role="status" aria-live="polite" hidden></div>
<dialog id="modal" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title"></h2><button class="btn icon ghost" id="close-modal" type="button" aria-label="닫기">×</button></div><div id="modal-body"></div></dialog>
<noscript>타일클럽을 플레이하려면 브라우저에서 JavaScript를 허용해 주세요.</noscript>
</body></html>
