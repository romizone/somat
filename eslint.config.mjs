import next from "eslint-config-next";

const eslintConfig = [
  ...next,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/**",
      // Salinan konflik dari sinkronisasi berkas ("nama 2.ts", "public 2/").
      // Isinya kembar dan sempat membuat lint menggantung pada berkas ter-minify.
      "**/* 2.*",
      "**/* 2/**",
      "** 2/**",
    ],
  },
];

export default eslintConfig;
