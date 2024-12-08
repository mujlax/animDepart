
const { 
    checkRequestLink,
    prepareReleaseFolder,
    getCanvasSize,
    insertScriptAfterMarker,
    wrapDiv,
    compressImages,
    replaceImagesWithBase64,
    minifyJSFiles,
    inlineJavaScript,
    deleteFiles,
    archiveFolder,
    downloadAndReplaceScript,
    createScreenshotWithTrigger,
    generateGif,
    deleteAllExceptImg
} = require('./utils/bannerUtils');

module.exports = {
    name: 'PBD',
    process: async (paths, userLink, platformWindow, platformSettings) => {
        userLink = await checkRequestLink(requestLink = false, userLink, platformWindow);

        for (const folderPath of paths) {
            const releasePath = await prepareReleaseFolder(folderPath);
            const { width, height } = getCanvasSize(releasePath);

            console.log(`Обрабатываем папку: ${folderPath}`);
            console.log(`Папка скопирована в ${releasePath}`);
            console.log(`Используемая ссылка: ${userLink}`);


            await insertScriptAfterMarker(releasePath,
                '<meta charset="UTF-8">',
                `<meta name="ad.size" content="width=${width},height=${height}">`
            );

          await insertScriptAfterMarker(releasePath,
                '<script src="https://code.createjs.com/1.0.0/createjs.min.js"></script>',
                `<script type="text/javascript" src="https://secure-ds.serving-sys.com/BurstingcachedScripts/libraries/createjs/1_0_0/createjs.min.js"></script>
                 <script type="text/javascript" src="https://secure-ds.serving-sys.com/BurstingScript/EBLoader.js"></script>
                 <style type="text/css">
                 body { margin:0px; overflow-x: hidden; }
                 #canvas { cursor: pointer; width: 240px; height: 400px; }
                 </style>`,
                  true
            );

          await insertScriptAfterMarker(releasePath,
                'var canvas, stage, exportRoot, anim_container, dom_overlay_container, fnStartAnimation;',
                `function isLocal(){
                   return \`(sizmek.ru|file:///|localhost|192.168.|127.0.0.1)/.test(\${window.location.href});\`
                 }
                 function clickthrough1(){
                    EB.clickthrough();
                    if(isLocal()){
                       console.log('> click');
                    }
                 }
                 function initEB() {
                    if (!EB.isInitialized()) {
                       EB.addEventListener(EBG.EventName.EB_INITIALIZED, startAd);
                    } else {
                       startAd();
                    }
                 }
                 function startAd() {
                    init();
                 }
                 if(isLocal()){
                    console.log(' -- Sizmek, 2018-10-12 -- ');
                 }
                var canvas, stage, exportRoot, anim_container, dom_overlay_container, fnStartAnimation;`, 
                true
            );

            await insertScriptAfterMarker(releasePath,
                '<body onload="init();" style="margin:0px;">',
                `<body onload="initEB();">`,
                true
            );

            try {
                await wrapDiv(releasePath, 'animation_container', `<a href="%banner.reference_mrc_user1%" target="%banner.target%">`);
                console.log('Div успешно обёрнут.');
            } catch (error) {
                console.error('Ошибка:', error.message);
            }

            await compressImages(releasePath);
            //await replaceImagesWithBase64(releasePath);
            await minifyJSFiles(releasePath);
            //inlineJavaScript(releasePath);
            await deleteFiles(releasePath, ['*.fla']);
            await archiveFolder(releasePath);

            if (platformSettings.useGif) {
                await createScreenshotWithTrigger(folderPath, platformSettings);
            }
            
        }
    }
};
