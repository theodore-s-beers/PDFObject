/* global ActiveXObject, window, console, define, module, jQuery */
// jshint unused:false, strict: false

/**
 *  PDFObject v2.1.1
 *  https://github.com/pipwerks/PDFObject
 *  @license
 *  Copyright (c) 2008-2018 Philip Hutchison
 *  MIT-style license: http://pipwerks.mit-license.org/
 *  UMD module pattern from https://github.com/umdjs/umd/blob/master/templates/returnExports.js
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module.
    define([], factory)
  } else if (typeof module === 'object' && module.exports) {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory()
  } else {
    // Browser globals (root is window)
    root.PDFObject = factory()
  }
})(this, function () {
  'use strict'
  // jshint unused:true

  // PDFObject is designed for client-side (browsers), not server-side (node)
  // Will choke on undefined navigator and window vars when run on server
  // Return boolean false and exit function when running server-side

  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  const pdfobjectversion = '2.1.1'
  const ua = window.navigator.userAgent

  // declare booleans
  const supportsPdfMimeType =
    typeof navigator.mimeTypes !== 'undefined' &&
    typeof navigator.mimeTypes['application/pdf'] !== 'undefined'
  const isModernBrowser = (function () {
    return typeof window.Promise !== 'undefined'
  })()
  const isFirefox = (function () {
    return ua.indexOf('irefox') !== -1
  })()
  const isFirefoxWithPDFJS = (function () {
    // Firefox started shipping PDF.js in Firefox 19.
    // If this is Firefox 19 or greater, assume PDF.js is available
    if (!isFirefox) {
      return false
    }
    // parse userAgent string to get release version ("rv")
    // ex: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.12; rv:57.0) Gecko/20100101 Firefox/57.0
    return parseInt(ua.split('rv:')[1].split('.')[0], 10) > 18
  })()
  const isIOS = (function () {
    return /iphone|ipad|ipod/i.test(ua.toLowerCase())
  })()

  /* ----------------------------------------------------
       Supporting functions
       ---------------------------------------------------- */

  const createAXO = function (type) {
    let ax
    try {
      ax = new ActiveXObject(type)
    } catch (e) {
      ax = null // ensure ax remains null
    }
    return ax
  }

  // IE11 still uses ActiveX for Adobe Reader, but IE 11 doesn't expose
  // window.ActiveXObject the same way previous versions of IE did
  // window.ActiveXObject will evaluate to false in IE 11, but "ActiveXObject" in window evaluates to true
  // so check the first one for older IE, and the second for IE11
  // FWIW, MS Edge (replacing IE11) does not support ActiveX at all, both will evaluate false
  // Constructed as a method (not a prop) to avoid unneccesarry overhead -- will only be evaluated if needed
  const isIE = function () {
    return !!(window.ActiveXObject || 'ActiveXObject' in window)
  }

  // Detect desktop Safari
  const isSafariOSX =
    !isIOS &&
    navigator.vendor &&
    navigator.vendor.indexOf('Apple') !== -1 &&
    navigator.userAgent &&
    navigator.userAgent.indexOf('Safari') !== -1

  // If either ActiveX support for "AcroPDF.PDF" or "PDF.PdfCtrl" are found, return true
  // Constructed as a method (not a prop) to avoid unneccesarry overhead -- will only be evaluated if needed
  const supportsPdfActiveX = function () {
    return !!(createAXO('AcroPDF.PDF') || createAXO('PDF.PdfCtrl'))
  }

  // Determines whether PDF support is available
  const supportsPDFs =
    // as of iOS 12, inline PDF rendering is still not supported in Safari or native webview
    // 3rd-party browsers (eg Chrome, Firefox) use Apple's webview for rendering, and thus the same result as Safari
    // Therefore if iOS, we shall assume that PDF support is not available
    !isIOS &&
    // Modern versions of Firefox come bundled with PDFJS
    (isFirefoxWithPDFJS ||
      // Browsers that still support the original MIME type check
      supportsPdfMimeType ||
      // Pity the poor souls still using IE
      (isIE() && supportsPdfActiveX()))

  // Create a fragment identifier for using PDF Open parameters when embedding PDF
  const buildFragmentString = function (pdfParams) {
    let string = ''
    let prop

    if (pdfParams) {
      for (prop in pdfParams) {
        if (Object.prototype.hasOwnProperty.call(pdfParams, prop)) {
          string +=
            encodeURIComponent(prop) +
            '=' +
            encodeURIComponent(pdfParams[prop]) +
            '&'
        }
      }

      // The string will be empty if no PDF Params found
      if (string) {
        string = '#' + string

        // Remove last ampersand
        string = string.slice(0, string.length - 1)
      }
    }

    return string
  }

  const log = function (msg) {
    if (typeof console !== 'undefined' && console.log) {
      console.log('[PDFObject] ' + msg)
    }
  }

  const embedError = function (msg) {
    log(msg)
    return false
  }

  const getTargetElement = function (targetSelector) {
    // Default to body for full-browser PDF
    let targetNode = document.body

    // If a targetSelector is specified, check to see whether
    // it's passing a selector, jQuery object, or an HTML element

    if (typeof targetSelector === 'string') {
      // Is CSS selector
      targetNode = document.querySelector(targetSelector)
    } else if (
      typeof jQuery !== 'undefined' &&
      targetSelector instanceof jQuery &&
      targetSelector.length
    ) {
      // Is jQuery element. Extract HTML node
      targetNode = targetSelector.get(0)
    } else if (
      typeof targetSelector.nodeType !== 'undefined' &&
      targetSelector.nodeType === 1
    ) {
      // Is HTML element
      targetNode = targetSelector
    }

    return targetNode
  }

  const appendTargetClassName = function (targetNode) {
    // Use classList if we don't need IE9 support
    const classToAppend = 'pdfobject-container'
    const classes = targetNode.className.split(/\s+/)
    if (classes.indexOf(classToAppend) === -1) {
      classes.push(classToAppend)
      targetNode.className = classes.join(' ')
    }
  }

  const generatePDFJSiframe = function (
    targetNode,
    url,
    pdfOpenFragment,
    PDFJS_URL,
    id
  ) {
    const fullURL =
      PDFJS_URL + '?file=' + encodeURIComponent(url) + pdfOpenFragment
    const scrollfix = isIOS
      ? '-webkit-overflow-scrolling: touch; overflow-y: scroll; '
      : 'overflow: hidden; '
    const iframe =
      "<div style='" +
      scrollfix +
      "position: absolute; top: 0; right: 0; bottom: 0; left: 0;'><iframe  " +
      id +
      " src='" +
      fullURL +
      "' style='border: none; width: 100%; height: 100%;' frameborder='0'></iframe></div>"
    appendTargetClassName(targetNode)
    targetNode.style.position = 'relative'
    targetNode.style.overflow = 'auto'
    targetNode.innerHTML = iframe
    return targetNode.getElementsByTagName('iframe')[0]
  }

  const generateEmbedElement = function (
    targetNode,
    targetSelector,
    url,
    pdfOpenFragment,
    width,
    height,
    id
  ) {
    let style = ''

    if (targetSelector && targetSelector !== document.body) {
      style = 'width: ' + width + '; height: ' + height + ';'
    } else {
      style =
        'position: absolute; top: 0; right: 0; bottom: 0; left: 0; width: 100%; height: 100%;'
    }

    appendTargetClassName(targetNode)
    targetNode.innerHTML =
      '<embed ' +
      id +
      " class='pdfobject' src='" +
      url +
      pdfOpenFragment +
      "' type='application/pdf' style='overflow: auto; " +
      style +
      "'/>"

    return targetNode.getElementsByTagName('embed')[0]
  }

  const generateIframeElement = function (
    targetNode,
    targetSelector,
    url,
    pdfOpenFragment,
    width,
    height,
    id
  ) {
    let style = ''

    if (targetSelector && targetSelector !== document.body) {
      style = 'width: ' + width + '; height: ' + height + ';'
    } else {
      style =
        'position: absolute; top: 0; right: 0; bottom: 0; left: 0; width: 100%; height: 100%;'
    }

    targetNode.className += ' pdfobject-container'
    targetNode.innerHTML =
      '<iframe ' +
      id +
      " class='pdfobject' src='" +
      url +
      pdfOpenFragment +
      "' type='application/pdf' style='border: none; " +
      style +
      "'/>"

    return targetNode.getElementsByTagName('iframe')[0]
  }

  const embed = function (url, targetSelector, options) {
    // Ensure URL is available. If not, exit now.
    if (typeof url !== 'string') {
      return embedError('URL is not valid')
    }

    // If targetSelector is not defined, convert to boolean
    targetSelector =
      typeof targetSelector !== 'undefined' ? targetSelector : false

    // Ensure options object is not undefined -- enables easier error checking below
    options = typeof options !== 'undefined' ? options : {}

    // Get passed options, or set reasonable defaults
    const id =
      options.id && typeof options.id === 'string'
        ? "id='" + options.id + "'"
        : ''
    const page = options.page ? options.page : false
    const pdfOpenParams = options.pdfOpenParams ? options.pdfOpenParams : {}
    const fallbackLink =
      typeof options.fallbackLink !== 'undefined' ? options.fallbackLink : true
    const width = options.width ? options.width : '100%'
    const height = options.height ? options.height : '100%'
    const assumptionMode =
      typeof options.assumptionMode === 'boolean'
        ? options.assumptionMode
        : true
    const forcePDFJS =
      typeof options.forcePDFJS === 'boolean' ? options.forcePDFJS : false
    const supportRedirect =
      typeof options.supportRedirect === 'boolean'
        ? options.supportRedirect
        : false
    const PDFJS_URL = options.PDFJS_URL ? options.PDFJS_URL : false
    const targetNode = getTargetElement(targetSelector)
    let fallbackHTML = ''
    let pdfOpenFragment = ''
    const fallbackHTMLDefault =
      "<p>This browser does not support inline PDFs. Please download the PDF to view it: <a href='[url]'>Download PDF</a></p>"

    // If target element is specified but is not valid, exit without doing anything
    if (!targetNode) {
      return embedError('Target element cannot be determined')
    }

    // page option overrides pdfOpenParams, if found
    if (page) {
      pdfOpenParams.page = page
    }

    // Stringify optional Adobe params for opening document (as fragment identifier)
    pdfOpenFragment = buildFragmentString(pdfOpenParams)

    // Do the dance

    // If the forcePDFJS option is invoked, skip everything else and embed as directed
    if (forcePDFJS && PDFJS_URL) {
      return generatePDFJSiframe(
        targetNode,
        url,
        pdfOpenFragment,
        PDFJS_URL,
        id
      )

      // If traditional support is provided, or if this is a modern browser and not iOS (see comment for supportsPDFs declaration)
    } else if (
      supportsPDFs ||
      (assumptionMode && isModernBrowser && supportsPDFs && !isIOS)
    ) {
      // Safari will not honour redirect responses on embed src.
      if (supportRedirect && isSafariOSX) {
        return generateIframeElement(
          targetNode,
          targetSelector,
          url,
          pdfOpenFragment,
          width,
          height,
          id
        )
      }

      return generateEmbedElement(
        targetNode,
        targetSelector,
        url,
        pdfOpenFragment,
        width,
        height,
        id
      )

      // If everything else has failed and a PDFJS fallback is provided, try to use it
    } else if (PDFJS_URL) {
      return generatePDFJSiframe(
        targetNode,
        url,
        pdfOpenFragment,
        PDFJS_URL,
        id
      )
    } else {
      // Display the fallback link if available
      if (fallbackLink) {
        fallbackHTML =
          typeof fallbackLink === 'string' ? fallbackLink : fallbackHTMLDefault
        targetNode.innerHTML = fallbackHTML.replace(/\[url\]/g, url)
      }

      return embedError('This browser does not support embedded PDFs')
    }
  }

  return {
    embed: function (a, b, c) {
      return embed(a, b, c)
    },
    pdfobjectversion: (function () {
      return pdfobjectversion
    })(),
    supportsPDFs: (function () {
      return supportsPDFs
    })()
  }
})
