# <a href="http://shaiii.com">ShaiiiCDN</a>

Shaiii CDN is webrtc based peer to peer CDN solution.
Use sha3 varify the received image, and use indexedDB cache the received image.

Well tested in:
IE  6, 7, 8, 9, 10, 11, Edge.
Chrome 30 to latest. 
Firefox 24 to latest.


how to use:

For static html elements:
<img src="/images/sample.jpg" /> change to <img shaiii-cdn='images/sample.jgp' /> That's all.

For dynamic loaded html elements:
<script>
var shaiiiCdn = new ShaiiiCDN({cache: true, timeout: 500});
//get new added images
var images = document.querySelectorAll('img[shaiii-cdn]');
shaiiiCdn.get(images);
</script>

or work with jQuery:
<script>
var shaiiiCdn = new ShaiiiCDN({cache: true, timeout: 500});
shaiiiCdn.get($('img[shaiii-cdn]'));
</script>
