// スライダー
// ドット（.dot）は HTML には書かず、ここで生成する。
// ソース上に対応する位置がない要素として、「JS が生成した要素は対象外」の確認に使う。
// E2E が不安定にならないよう、自動で切り替わるタイマーは付けていない。
(function () {
  var slider = document.querySelector("#slider");
  if (!slider) return;

  var slides = slider.querySelectorAll(".slide");
  var dots = slider.querySelector(".dots");
  var current = 0;

  slides.forEach(function (slide, index) {
    var dot = document.createElement("button");
    dot.type = "button";
    dot.className = "dot";
    dot.setAttribute("aria-label", index + 1 + " 枚目を表示");
    dot.addEventListener("click", function () {
      show(index);
    });
    dots.appendChild(dot);
  });

  function show(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach(function (slide, i) {
      slide.classList.toggle("is-active", i === current);
    });
    dots.querySelectorAll(".dot").forEach(function (dot, i) {
      dot.classList.toggle("is-active", i === current);
    });
  }

  slider.querySelector(".prev").addEventListener("click", function () {
    show(current - 1);
  });
  slider.querySelector(".next").addEventListener("click", function () {
    show(current + 1);
  });

  show(0);
})();
