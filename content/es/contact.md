---
title: "Contacto"
date: 2025-11-28
draft: false
noSummary: true
---


<form action="https://formspree.io/f/xldyyvyl" method="POST">
  <label>
    Tu email: <input type="email" name="email">
  </label>
  <label>
    Motivo de contacto:
    <select name="motive" required>
      {{< contact_motives >}}
    </select>
  </label>
  <label>
    Mensaje:
    <textarea name="message"></textarea>
  </label>
  
  <!-- Campo honeypot  -->
  <input type="text" name="_gotcha" style="display:none">

  <div class="g-recaptcha" data-sitekey="6Lc8khssAAAAAM1COzbwT9DE3bsjJTVxyWjIlfIz" data-action="login"></div>
  <!-- <script src="https://www.google.com/recaptcha/api.js" async defer></script> -->
  <script src="https://www.google.com/recaptcha/enterprise.js" async defer></script>

  
  <button type="submit">Enviar</button>
</form>

