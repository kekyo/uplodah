// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditNote from '@mui/icons-material/EditNote';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { ApiCommandExample } from '../utils/commandExamples';

interface ApiExamplesAccordionProps {
  apiExamples: ApiCommandExample[];
  loading: boolean;
  onCopy: (value: string) => void;
}

const resolveCopyLabel = (title: string): string =>
  title.startsWith('Upload API') ? 'Copy upload' : 'Copy download';

const ApiExamplesAccordion = ({
  apiExamples,
  loading,
  onCopy,
}: ApiExamplesAccordionProps) => (
  <Accordion
    disableGutters
    sx={{
      mb: 4,
      bgcolor: (theme) =>
        theme.palette.mode === 'light' ? 'primary.50' : 'grey.900',
      borderColor: (theme) =>
        theme.palette.mode === 'light' ? 'primary.100' : 'grey.800',
      borderWidth: 1,
      borderStyle: 'solid',
      boxShadow: 1,
      '&:before': {
        display: 'none',
      },
    }}
  >
    <AccordionSummary
      expandIcon={<ExpandMoreIcon />}
      aria-controls="api-examples-content"
      id="api-examples-header"
      sx={{
        px: 2,
        minHeight: 72,
        '& .MuiAccordionSummary-content': {
          my: 1.5,
        },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="body2"
          fontSize="1.3rem"
          color="text.secondary"
          gutterBottom
        >
          <EditNote fontSize="small" sx={{ mr: 0.5 }} />
          API Examples
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {loading
            ? 'Loading API examples...'
            : `${apiExamples.length} commands available`}
        </Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails sx={{ px: 2, pb: 2 }}>
      {loading ? (
        <Typography variant="body2" color="text.secondary">
          Loading API examples...
        </Typography>
      ) : (
        apiExamples.map((apiExample, index) => (
          <Box
            key={apiExample.title}
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                sm: 'minmax(0, 1fr) 11rem',
              },
              alignItems: 'start',
              gap: 2,
              mt: index === 0 ? 0 : 1.5,
            }}
          >
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                fontSize="1.05rem"
                color="text.secondary"
                gutterBottom
              >
                {apiExample.title}
              </Typography>
              <Typography
                variant="body2"
                marginLeft="1rem"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '1rem',
                  wordBreak: 'break-all',
                }}
              >
                {apiExample.command}
              </Typography>
            </Box>
            <Box
              sx={{
                display: 'flex',
                justifyContent: {
                  xs: 'flex-start',
                  sm: 'flex-end',
                },
              }}
            >
              <Button
                variant="outlined"
                startIcon={<ContentCopyIcon />}
                onClick={() => onCopy(apiExample.command)}
                sx={{
                  width: {
                    xs: '100%',
                    sm: '11rem',
                  },
                  justifyContent: 'flex-start',
                  flexShrink: 0,
                }}
              >
                {resolveCopyLabel(apiExample.title)}
              </Button>
            </Box>
          </Box>
        ))
      )}
    </AccordionDetails>
  </Accordion>
);

export default ApiExamplesAccordion;
