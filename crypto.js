var CryptoJS = CryptoJS || (function (Math) {
    var C = {};
    var util = C.lib = {};
    var Base = util.Base = (function () {
        function F() {}
        return {
            extend: function (overrides) {
                F.prototype = this;
                var subtype = new F();
                if (overrides) {
                    subtype.mixIn(overrides);
                }
                if (!subtype.hasOwnProperty('init') || this.init === subtype.init) {
                    subtype.init = function () {
                        subtype.$super.init.apply(this, arguments);
                    };
                }
                subtype.init.prototype = subtype;
                subtype.$super = this;
                return subtype;
            },
            create: function () {
                var subtype = this.extend();
                subtype.init.apply(subtype, arguments);
                return subtype;
            },
            init: function () {},
            mixIn: function (properties) {
                for (var propertyName in properties) {
                    properties.hasOwnProperty(propertyName) && (this[propertyName] = properties[propertyName]);
                }
                if (properties.hasOwnProperty('toString')) {
                    this.toString = properties.toString;
                }
            },
            clone: function () {
                return this.init.prototype.extend(this);
            }
        };
    }());
    var WordArray = util.WordArray = Base.extend({
        init: function (words, sigBytes) {
            words = this.words = words || [];
            if (sigBytes != C.undefined) {
                this.sigBytes = sigBytes;
            } else {
                this.sigBytes = words.length * 4;
            }
        },
        toString: function (encoder) {
            return (encoder || Hex).stringify(this);
        },
        concat: function (wordArray) {
            var thisWords = this.words;
            var thatWords = wordArray.words;
            var thisSigBytes = this.sigBytes;
            var thatSigBytes = wordArray.sigBytes;
            this.clamp();
            if (thisSigBytes % 4) {
                for (var i = 0; i < thatSigBytes; i++) {
                    var thatByte = (thatWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                    thisWords[(thisSigBytes + i) >>> 2] |= thatByte << (24 - ((thisSigBytes + i) % 4) * 8);
                }
            } else {
                for (var i = 0; i < thatSigBytes; i += 4) {
                    thisWords[(thisSigBytes + i) >>> 2] = thatWords[i >>> 2];
                }
            }
            this.sigBytes += thatSigBytes;
            return this;
        },
        clamp: function () {
            var words = this.words;
            var sigBytes = this.sigBytes;
            words[sigBytes >>> 2] &= 0xffffffff << (32 - (sigBytes % 4) * 8);
            words.length = Math.ceil(sigBytes / 4);
        },
        clone: function () {
            var clone = Base.clone.call(this);
            clone.words = this.words.slice(0);
            return clone;
        },
        // ADDED SPLICE METHOD HERE
        splice: function (start, deleteCount) { // <- 修正点1: splice メソッドを追加
            this.words.splice(start, deleteCount);
            this.sigBytes = this.words.length * 4;
        },
        random: function (nBytes) {
            var words = [];
            var r;

            // Try to use native crypto for secure random numbers
            if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') {
                r = function() {
                    return window.crypto.getRandomValues(new Uint32Array(1))[0];
                };
            } else if (typeof self !== 'undefined' && self.crypto && typeof self.crypto.getRandomValues === 'function') {
                r = function() {
                    return self.crypto.getRandomValues(new Uint32Array(1))[0];
                };
            } else if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
                r = function() {
                    return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
                };
            } else {
                // Fallback to Math.random (less secure)
                console.warn("Native crypto module could not be used to get secure random number. Falling back to Math.random (less secure).");
                r = function() {
                    return Math.random() * 0x100000000 | 0;
                };
            }
            
            for (var i = 0; i < nBytes; i += 4) {
                words.push(r());
            }
            return new WordArray.init(words, nBytes);
        }
    });
    var C_enc = C.enc = {};
    var Hex = C_enc.Hex = {
        stringify: function (wordArray) {
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;
            var hexChars = [];
            for (var i = 0; i < sigBytes; i++) {
                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                hexChars.push((bite >>> 4).toString(16));
                hexChars.push((bite & 0x0f).toString(16));
            }
            return hexChars.join('');
        },
        parse: function (hexStr) {
            var hexStrLength = hexStr.length;
            var words = [];
            for (var i = 0; i < hexStrLength; i += 2) {
                words[i >>> 3] |= parseInt(hexStr.substr(i, 2), 16) << (24 - (i % 8) * 4);
            }
            return new WordArray.init(words, hexStrLength * 4);
        }
    };
    var Latin1 = C_enc.Latin1 = {
        stringify: function (wordArray) {
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;
            var latin1Chars = [];
            for (var i = 0; i < sigBytes; i++) {
                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                latin1Chars.push(String.fromCharCode(bite));
            }
            return latin1Chars.join('');
        },
        parse: function (latin1Str) {
            var latin1StrLength = latin1Str.length;
            var words = [];
            for (var i = 0; i < latin1StrLength; i++) {
                words[i >>> 2] |= (latin1Str.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
            }
            return new WordArray.init(words, latin1StrLength);
        }
    };
    var Utf8 = C_enc.Utf8 = {
        stringify: function (wordArray) {
            try {
                return decodeURIComponent(escape(Latin1.stringify(wordArray)));
            } catch (e) {
                throw new Error('Malformed UTF-8 data');
            }
        },
        parse: function (utf8Str) {
            return Latin1.parse(unescape(encodeURIComponent(utf8Str)));
        }
    };
    var Base64 = C_enc.Base64 = {
        stringify: function (wordArray) {
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;
            var map = this._map;
            wordArray.clamp();
            var base64Chars = [];
            for (var i = 0; i < sigBytes; i += 3) {
                var byte1 = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                var byte2 = (words[(i + 1) >>> 2] >>> (24 - ((i + 1) % 4) * 8)) & 0xff;
                var byte3 = (words[(i + 2) >>> 2] >>> (24 - ((i + 2) % 4) * 8)) & 0xff;
                var triplet = (byte1 << 16) | (byte2 << 8) | byte3;
                for (var j = 0; j < 4 && i + j * 0.75 < sigBytes; j++) {
                    base64Chars.push(map.charAt((triplet >>> (6 * (3 - j))) & 0x3f));
                }
            }
            var paddingChar = map.charAt(64);
            if (paddingChar) {
                while (base64Chars.length % 4) {
                    base64Chars.push(paddingChar);
                }
            }
            return base64Chars.join('');
        },
        parse: function (base64Str) {
            var base64StrLength = base64Str.length;
            var map = this._map;
            var paddingChar = map.charAt(64);
            if (paddingChar) {
                var paddingIndex = base64Str.indexOf(paddingChar);
                if (paddingIndex != -1) {
                    base64StrLength = paddingIndex;
                }
            }
            var words = [];
            var nBytes = 0;
            for (var i = 0; i < base64StrLength; i++) {
                if (i % 4) {
                    var bits1 = map.indexOf(base64Str.charAt(i - 1)) << ((i % 4) * 2);
                    var bits2 = map.indexOf(base64Str.charAt(i)) >>> (6 - (i % 4) * 2);
                    words[nBytes >>> 2] |= (bits1 | bits2) << (24 - (nBytes % 4) * 8);
                    nBytes++;
                }
            }
            return new WordArray.init(words, nBytes);
        },
        _map: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    };

    // BufferedBlockAlgorithm の定義
    var BufferedBlockAlgorithm = util.BufferedBlockAlgorithm = Base.extend({
        reset: function () {
            this._data = new WordArray.init();
            this._nDataBytes = 0;
        },
        _append: function (data) {
            if (typeof data == 'string') {
                data = Utf8.parse(data);
            }
            this._data.concat(data);
            this._nDataBytes += data.sigBytes;
        },
        _process: function (doFlush) {
            var data = this._data;
            var dataWords = data.words;
            var dataSigBytes = data.sigBytes;
            var blockSize = this.blockSize;
            var blockSizeBytes = blockSize * 4;
            var nBlocksReady = dataSigBytes / blockSizeBytes;
            if (doFlush) {
                nBlocksReady = Math.ceil(nBlocksReady);
            } else {
                nBlocksReady = Math.max((nBlocksReady | 0) - this._minBufferSize, 0);
            }
            var nWordsReady = nBlocksReady * blockSize;
            var nWordsProcessed = Math.min(nWordsReady, dataWords.length);
            for (var offset = 0; offset < nWordsProcessed; offset += blockSize) {
                this._doProcessBlock(dataWords, offset);
            }
            var nBytesProcessed = nWordsProcessed * 4;
            data.splice(0, nWordsProcessed); // <- ここで WordArray.splice が使われる
            this._nDataBytes -= nBytesProcessed;
        },
        _minBufferSize: 0
    });

    // Hasher の定義 (BufferedBlockAlgorithm を継承するように変更)
    var Hasher = util.Hasher = BufferedBlockAlgorithm.extend({ // <- 修正点2: Base を BufferedBlockAlgorithm に変更
        cfg: Base.extend(),
        init: function (cfg) {
            this.cfg = this.cfg.extend(cfg);
            this.reset();
        },
        reset: function () {
            BufferedBlockAlgorithm.reset.call(this); // <- 修正点3: 親クラスの reset を呼び出す
            this._doReset();
        },
        update: function (messageUpdate) {
            this._append(messageUpdate);
            this._process();
            return this;
        },
        finalize: function (messageUpdate) {
            messageUpdate && this._append(messageUpdate);
            this._doFinalize();
            return this._hash;
        },
        blockSize: 16,
        _createHelper: function (hasher) {
            return function (message, cfg) {
                return new hasher.init(cfg).finalize(message);
            };
        },
        _createHmacHelper: function (hasher) {
            return function (message, key) {
                return new HMAC.init(hasher, key).finalize(message);
            };
        }
    });
    
    var C_algo = C.algo = {};
    var G = C_algo.SHA256 = Hasher.extend({
        _doReset: function () {
            this._hash = new WordArray.init([
                0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
            ]);
        },
        _doProcessBlock: function (M, offset) {
            var K = [
                0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
                0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
                0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
                0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
                0xe49b69c1, 0efbe4786, 0x0fc19dc6, 0x240ca1cc,
                0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
                0x983e5152, 0xa831c66d, 0xb00327c8, 0bf597fc7,
                0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
                0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
                0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
                0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
                0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
                0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
                0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
                0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
                0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
            ];
            var a = this._hash.words[0];
            var b = this._hash.words[1];
            var c = this._hash.words[2];
            var d = this._hash.words[3];
            var e = this._hash.words[4];
            var f = this._hash.words[5];
            var g = this._hash.words[6];
            var h = this._hash.words[7];
            var W = [];
            for (var i = 0; i < 64; i++) {
                if (i < 16) {
                    W[i] = M[offset + i] | 0;
                } else {
                    var gamma0x = W[i - 15];
                    var gamma0 = ((gamma0x << 25) | (gamma0x >>> 7)) ^ ((gamma0x << 14) | (gamma0x >>> 18)) ^ (gamma0x >>> 3);
                    var gamma1x = W[i - 2];
                    var gamma1 = ((gamma1x << 15) | (gamma1x >>> 17)) ^ ((gamma1x << 13) | (gamma1x >>> 19)) ^ (gamma1x >>> 10);
                    W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16];
                }
                var t1 = h + (((e << 26) | (e >>> 6)) ^ ((e << 21) | (e >>> 11)) ^ ((e << 7) | (e >>> 25))) + ((e & f) ^ (~e & g)) + K[i] + W[i];
                var t2 = (((a << 30) | (a >>> 2)) ^ ((a << 19) | (a >>> 13)) ^ ((a << 10) | (a >>> 22))) + ((a & b) ^ (a & c) ^ (b & c));
                h = g;
                g = f;
                f = e;
                e = d + t1;
                d = c;
                c = b;
                b = a;
                a = t1 + t2;
            }
            this._hash.words[0] += a;
            this._hash.words[1] += b;
            this._hash.words[2] += c;
            this._hash.words[3] += d;
            this._hash.words[4] += e;
            this._hash.words[5] += f;
            this._hash.words[6] += g;
            this._hash.words[7] += h;
        },
        _doFinalize: function () {
            var data = this._data;
            var dataWords = data.words;
            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;
            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = Math.floor(nBitsTotal / 0x100000000);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = nBitsTotal;
            data.sigBytes = dataWords.length * 4;
            this._process();
        }
    });
    C.SHA256 = Hasher._createHelper(G);
    var Cipher = util.Cipher = BufferedBlockAlgorithm.extend({
        cfg: Base.extend(),
        createEncryptor: function (key, cfg) {
            return this.create(Encryptor, key, cfg);
        },
        createDecryptor: function (key, cfg) {
            return this.create(Decryptor, key, cfg);
        },
        init: function (xformMode, key, cfg) {
            this.xformMode = xformMode;
            this._key = key;
            this.cfg = this.cfg.extend(cfg);
            this.reset();
        },
        reset: function () {
            BufferedBlockAlgorithm.reset.call(this);
            this._doReset();
        },
        process: function (dataUpdate) {
            this._append(dataUpdate);
            this._process();
            return this._data;
        },
        finalize: function (dataUpdate) {
            dataUpdate && this._append(dataUpdate);
            this._doFinalize();
            return this._data;
        },
        blockSize: 4
    });
    var Encryptor = Cipher.extend({
        _doFinalize: function () {
            this.cfg.padding.pad(this._data, this.blockSize);
            return this._process(!0);
        }
    });
    var Decryptor = Cipher.extend({
        _doFinalize: function () {
            this._process(!0);
            this.cfg.padding.unpad(this._data, this.blockSize);
        }
    });
    var C_mode = C.mode = {};
    var CBC = C_mode.CBC = (function () {
        var CBC = Base.extend({
            Encryptor: Base.extend({
                processBlock: function (words, offset) {
                    var cipher = this._cipher;
                    var blockSize = cipher.blockSize;
                    xorBlock.call(this, words, offset, blockSize);
                    cipher.encryptBlock(words, offset);
                    this._prevBlock = words.slice(offset, offset + blockSize);
                }
            }),
            Decryptor: Base.extend({
                processBlock: function (words, offset) {
                    var cipher = this._cipher;
                    var blockSize = cipher.blockSize;
                    var thisBlock = words.slice(offset, offset + blockSize);
                    cipher.decryptBlock(words, offset);
                    xorBlock.call(this, words, offset, blockSize);
                    this._prevBlock = thisBlock;
                }
            })
        });
        function xorBlock(words, offset, blockSize) {
            var iv = this._iv;
            if (iv) {
                var prevBlock = iv;
                this._iv = undefined;
            } else {
                var prevBlock = this._prevBlock;
            }
            for (var i = 0; i < blockSize; i++) {
                words[offset + i] ^= prevBlock[i];
            }
        }
        return CBC;
    }());
    var C_pad = C.pad = {};
    var Pkcs7 = C_pad.Pkcs7 = {
        pad: function (wordArray, blockSize) {
            var blockSizeBytes = blockSize * 4;
            var nPaddingBytes = blockSizeBytes - (wordArray.sigBytes % blockSizeBytes);
            var paddingWord = (nPaddingBytes << 24) | (nPaddingBytes << 16) | (nPaddingBytes << 8) | nPaddingBytes;
            var paddingWords = [];
            for (var i = 0; i < nPaddingBytes; i += 4) {
                paddingWords.push(paddingWord);
            }
            var padding = new WordArray.init(paddingWords, nPaddingBytes);
            wordArray.concat(padding);
        },
        unpad: function (wordArray) {
            var sigBytes = wordArray.sigBytes;
            var nPaddingBytes = sigBytes - (wordArray.words[(sigBytes - 1) >>> 2] & 0xff);
            wordArray.sigBytes = nPaddingBytes;
        }
    };
    var AES = C_algo.AES = Cipher.extend({
        _doReset: function () {
            var key = this._key;
            var nRounds = key.words.length + 6;
            this._nRounds = nRounds;
            var ksRows = (nRounds + 1) * 4;
            var keySchedule = this._keySchedule = [];
            for (var ksRow = 0; ksRow < ksRows; ksRow++) {
                keySchedule[ksRow] = ksRow < key.words.length ? key.words[ksRow] : 0;
            }
        },
        encryptBlock: function (M, offset) {
        },
        decryptBlock: function (M, offset) {
        },
        keySize: 8
    });
    C.AES = {
        encrypt: function (message, key, cfg) {
            return AES.createEncryptor(key, cfg).finalize(message);
        },
        decrypt: function (ciphertext, key, cfg) {
            return AES.createDecryptor(key, cfg).finalize(ciphertext);
        }
    };
    return C;
}(Math));