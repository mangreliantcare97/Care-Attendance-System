/**
 * Employee photos.
 *
 * The browser scales the picture down before it is uploaded, so the request
 * stays small. The server checks the size and the type again — this is a
 * convenience, not a security measure.
 */
(function () {
  var MAX_BYTES = 262144; // 256 KB
  var MAX_EDGE = 512; // pixels

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();

      reader.onload = function () {
        var image = new Image();
        image.onload = function () {
          resolve(image);
        };
        image.onerror = function () {
          reject(new Error('The photo could not be read.'));
        };
        image.src = reader.result;
      };

      reader.onerror = function () {
        reject(new Error('The photo could not be read.'));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Scale the picture down and return `{data, mime, size}`.
   *
   * `data` is the plain base64 payload (without the data url prefix), `mime`
   * the type of the picture that was actually produced and `size` the number
   * of bytes.
   */
  async function downscale(file) {
    if (!file) {
      return null;
    }

    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      throw new Error('Only JPEG, PNG and WebP photos are allowed.');
    }

    var image = await loadImage(file);
    var scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
    var width = Math.max(1, Math.round(image.width * scale));
    var height = Math.max(1, Math.round(image.height * scale));

    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    var context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    var base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    var size = Math.ceil((base64.length * 3) / 4);

    if (size > MAX_BYTES) {
      throw new Error('The photo is still too large after scaling — please choose a smaller picture.');
    }

    return { data: base64, mime: 'image/jpeg', size: size };
  }

  window.HrmPhoto = {
    downscale: downscale,
    maxBytes: MAX_BYTES,
  };
})();
