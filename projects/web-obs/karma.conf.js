module.exports = function (config) {
  config.set({
    basePath: "",
    frameworks: ["jasmine", "@angular-devkit/build-angular"],
    plugins: [require("karma-jasmine"), require("karma-chrome-launcher"), require("karma-jasmine-html-reporter"), require("karma-coverage"), require("@angular-devkit/build-angular/plugins/karma"), require("karma-firefox-launcher")],
    client: {
      jasmine: {
        random: false,
      },
      clearContext: false, // leave Jasmine Spec Runner output visible in browser
    },
    jasmineHtmlReporter: {
      suppressAll: true, // removes the duplicated traces
    },
    coverageReporter: {
      dir: require("path").join(__dirname, "../../coverage/web-obs"),
      subdir: ".",
      reporters: [{ type: "html" }, { type: "text-summary" }, { type: "text" }],
      check: {
        global: {
          statements: 80,
          branches: 95,
          functions: 80,
          lines: 80,
        },
      },
    },
    reporters: ["progress", "kjhtml"],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    browsers: ["FirefoxHeadless"],
    singleRun: false,
    restartOnFileChange: true,
  });
};
