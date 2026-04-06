// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { Box } from '@mui/material';
import faviconUrl from '../favicon.svg';

const AppHeaderIcon = () => (
  <Box
    component="img"
    src={faviconUrl}
    alt=""
    aria-hidden="true"
    sx={{
      height: '2.3rem',
      width: '2.3rem',
      marginRight: '1rem',
      flexShrink: 0,
    }}
  />
);

export default AppHeaderIcon;
