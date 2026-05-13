'use strict';

/** @type (HTMLCanvasElement|null) */
const canvas = document.getElementById('gl-canvas');
const gl = canvas.getContext('webgl');

if (!gl) {
    alert('WebGL is not supported by this browser!');
    throw new Error('WebGL not available');
} 

console.log('WebGL correctly initialized');

